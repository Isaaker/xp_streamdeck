// X-Plane Stream Deck Plugin — Property Inspector helpers.
// Shared by every action's PI to:
//   - hook autocomplete into <sdpi-textfield> path inputs (DataRef + Command)
//   - show a live value preview while editing a DataRef path
//   - safely merge settings updates without wiping concurrent fields
//
// Loads after https://sdpi-components.dev/releases/v4/sdpi-components.js, so
// `window.SDPIComponents.streamDeckClient` is expected to be available by the
// time PI scripts wire things up.

(() => {
	"use strict";

	const API_BASE = "http://localhost:8086/api/v3";
	const DEBOUNCE_MS = 300;
	const PREVIEW_INTERVAL_MS = 1000;
	const FETCH_TIMEOUT_MS = 2000;

	const PATH_RE = /^(.+?)(?:\[(\d+)\])?$/;
	const parseDataRefPath = (input) => {
		const trimmed = String(input ?? "").trim();
		const m = PATH_RE.exec(trimmed);
		if (!m) return { basePath: trimmed };
		return { basePath: m[1], index: m[2] !== undefined ? Number(m[2]) : undefined };
	};

	const getClient = () => window.SDPIComponents?.streamDeckClient;

	// ---------------- Settings cache ----------------
	// We keep the freshest known settings locally so partial updates we
	// make for image uploads / clears never wipe sibling fields when
	// getSettings() is momentarily empty.

	let cached = null;
	let cacheReady = false;

	const refresh = async () => {
		const client = getClient();
		if (!client) return;
		try {
			const s = await client.getSettings();
			if (s && typeof s === "object") cached = s;
		} catch (err) {
			console.error("xplane-pi-helpers: getSettings failed", err);
		}
	};

	const ready = (async () => {
		await refresh();
		cacheReady = true;
		const client = getClient();
		const live = client?.didReceiveSettings;
		if (live && typeof live.subscribe === "function") {
			live.subscribe((arg) => {
				const s = arg?.payload?.settings ?? arg?.settings;
				if (s && typeof s === "object") cached = s;
			});
		}
	})();

	const updateSetting = async (key, value) => {
		if (!cacheReady) await ready;
		await refresh();
		const client = getClient();
		if (!client) return;
		if (!cached || typeof cached !== "object") {
			console.warn(`xplane-pi-helpers: refusing to write ${key} — no baseline`);
			return;
		}
		const next = { ...cached };
		if (value === undefined || value === "") delete next[key];
		else next[key] = value;
		cached = next;
		await client.setSettings(next);
	};

	// ---------------- Image upload ----------------
	// Stream Deck XL key resolution is 96px; @2x = 144px. Larger images inflate
	// the data URL persisted into settings (each kilobyte is shipped over the
	// SD WS protocol on every read), and very large data URLs have been
	// observed to be silently dropped by the SD software on state transitions.
	// Downscale to 144x144 PNG before persisting.

	const readAsDataURL = (file) =>
		new Promise((resolve, reject) => {
			const r = new FileReader();
			r.onload = () => resolve(String(r.result));
			r.onerror = () => reject(r.error);
			r.readAsDataURL(file);
		});

	const resizeToPng = (dataUrl, targetSize = 144) =>
		new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement("canvas");
				canvas.width = targetSize;
				canvas.height = targetSize;
				const ctx = canvas.getContext("2d");
				if (!ctx) {
					reject(new Error("Canvas 2D context unavailable"));
					return;
				}
				const scale = Math.min(targetSize / img.width, targetSize / img.height);
				const w = img.width * scale;
				const h = img.height * scale;
				const x = (targetSize - w) / 2;
				const y = (targetSize - h) / 2;
				ctx.clearRect(0, 0, targetSize, targetSize);
				ctx.drawImage(img, x, y, w, h);
				resolve(canvas.toDataURL("image/png"));
			};
			img.onerror = () => reject(new Error("Image decode failed"));
			img.src = dataUrl;
		});

	const setThumbBackground = (el, dataUrl) => {
		if (!el) return;
		el.style.backgroundImage = dataUrl ? `url("${dataUrl}")` : "";
	};

	// Wires a file input + thumbnail + reset button into the shared settings
	// cache. The settings key is removed when the user clears the image, so
	// missing == "no custom image" without a sentinel value.
	const wireImageUpload = ({ input, thumb, clearButton, settingKey, pickButton }) => {
		if (!input || !thumb || !settingKey) {
			console.warn("xplane-pi-helpers: wireImageUpload missing input/thumb/settingKey");
			return;
		}

		// Initial thumbnail from whatever the cache already has — wait for the
		// ready promise to make sure didReceiveSettings has filled `cached`.
		ready.then(() => {
			const initial = cached?.[settingKey];
			if (typeof initial === "string" && initial) setThumbBackground(thumb, initial);
		});

		input.addEventListener("change", async () => {
			const file = input.files?.[0];
			if (!file) return;
			try {
				const raw = await readAsDataURL(file);
				const dataUrl = await resizeToPng(raw);
				setThumbBackground(thumb, dataUrl);
				await updateSetting(settingKey, dataUrl);
			} catch (err) {
				console.error(`xplane-pi-helpers: failed to read image for ${settingKey}`, err);
			} finally {
				input.value = "";
			}
		});

		if (pickButton) {
			pickButton.addEventListener("click", () => input.click());
		}

		if (clearButton) {
			clearButton.addEventListener("click", async () => {
				setThumbBackground(thumb, "");
				await updateSetting(settingKey, undefined);
			});
		}
	};

	// ---------------- Generic helpers ----------------

	const debounce = (fn, ms) => {
		let t = null;
		return (...args) => {
			if (t) clearTimeout(t);
			t = setTimeout(() => fn(...args), ms);
		};
	};

	const fetchWithTimeout = async (url) => {
		const ac = new AbortController();
		const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
		try {
			return await fetch(url, { signal: ac.signal });
		} finally {
			clearTimeout(timer);
		}
	};

	const findInnerInput = (sdpiField) =>
		sdpiField.shadowRoot?.querySelector("input") || sdpiField.querySelector("input");

	const waitForInnerInput = async (sdpiField, retries = 30) => {
		for (let i = 0; i < retries; i++) {
			const inner = findInnerInput(sdpiField);
			if (inner) return inner;
			await new Promise((r) => setTimeout(r, 50));
		}
		return null;
	};

	// ---------------- Autocomplete via <datalist> ----------------

	const fetchSuggestions = async (kind, prefix) => {
		if (!prefix || prefix.length < 2) return [];
		const endpoint = kind === "command" ? "commands" : "datarefs";
		try {
			const res = await fetchWithTimeout(
				`${API_BASE}/${endpoint}?filter[name]=${encodeURIComponent(prefix)}`,
			);
			if (!res.ok) return [];
			const body = await res.json();
			const items = Array.isArray(body?.data) ? body.data : [];
			return items
				.slice(0, 20)
				.map((it) => it?.name)
				.filter((n) => typeof n === "string");
		} catch {
			return [];
		}
	};

	const attachAutocomplete = async (sdpiField, kind) => {
		const inner = await waitForInnerInput(sdpiField);
		if (!inner) {
			console.warn("xplane-pi-helpers: cannot find inner input for autocomplete");
			return;
		}
		const list = document.createElement("datalist");
		list.id = `xplane-suggest-${Math.random().toString(36).slice(2, 8)}`;
		document.body.appendChild(list);
		inner.setAttribute("list", list.id);
		// Browsers cap autocomplete to a list when type=text, which is our
		// default here. No special tweaks needed.
		inner.setAttribute("autocomplete", "off");

		const refreshList = debounce(async () => {
			const suggestions = await fetchSuggestions(kind, inner.value.trim());
			list.innerHTML = "";
			for (const s of suggestions) {
				const opt = document.createElement("option");
				opt.value = s;
				list.appendChild(opt);
			}
		}, DEBOUNCE_MS);

		inner.addEventListener("input", refreshList);
		inner.addEventListener("focus", refreshList);
	};

	// ---------------- Live DataRef preview ----------------

	const fetchDataRefValue = async (rawName) => {
		const { basePath, index } = parseDataRefPath(rawName);
		try {
			const r1 = await fetchWithTimeout(
				`${API_BASE}/datarefs?filter[name]=${encodeURIComponent(basePath)}`,
			);
			if (!r1.ok) return { state: "error" };
			const body = await r1.json();
			const match = body?.data?.find((d) => d?.name === basePath) ?? body?.data?.[0];
			if (!match || typeof match.id !== "number") return { state: "not-found" };
			const r2 = await fetchWithTimeout(`${API_BASE}/datarefs/${match.id}/value`);
			if (!r2.ok) return { state: "error" };
			const valBody = await r2.json();
			const raw = valBody?.data;
			if (index === undefined) return { state: "ok", value: raw };
			if (!Array.isArray(raw)) {
				return { state: "error", message: "not an array" };
			}
			if (index < 0 || index >= raw.length) {
				return { state: "error", message: `index ${index} out of bounds (length ${raw.length})` };
			}
			return { state: "ok", value: raw[index] };
		} catch {
			return { state: "error" };
		}
	};

	const formatPreview = (result) => {
		switch (result.state) {
			case "ok": {
				const v = result.value;
				if (v === undefined) return "—";
				if (typeof v === "object") return JSON.stringify(v);
				return String(v);
			}
			case "not-found":
				return "Not found";
			case "error":
				return result.message ? result.message : "X-Plane unreachable";
			default:
				return "";
		}
	};

	const attachLivePreview = async (sdpiField, previewEl) => {
		const inner = await waitForInnerInput(sdpiField);
		if (!inner) return;

		let timer = null;
		const stop = () => {
			if (timer) clearInterval(timer);
			timer = null;
		};
		const tick = async () => {
			const name = inner.value.trim();
			if (!name) {
				previewEl.textContent = "";
				stop();
				return;
			}
			const result = await fetchDataRefValue(name);
			previewEl.textContent = formatPreview(result);
			previewEl.dataset.state = result.state;
		};

		const restart = debounce(() => {
			stop();
			tick();
			timer = setInterval(tick, PREVIEW_INTERVAL_MS);
		}, DEBOUNCE_MS);

		inner.addEventListener("input", restart);
		// Kick off if a value is already present (re-opening the PI).
		if (inner.value.trim()) restart();
	};

	window.XPlanePI = {
		attachAutocomplete,
		attachLivePreview,
		updateSetting,
		resizeToPng,
		wireImageUpload,
	};
})();
