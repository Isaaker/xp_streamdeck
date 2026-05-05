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

	const fetchDataRefValue = async (name) => {
		try {
			const r1 = await fetchWithTimeout(
				`${API_BASE}/datarefs?filter[name]=${encodeURIComponent(name)}`,
			);
			if (!r1.ok) return { state: "error" };
			const body = await r1.json();
			const match = body?.data?.find((d) => d?.name === name) ?? body?.data?.[0];
			if (!match || typeof match.id !== "number") return { state: "not-found" };
			const r2 = await fetchWithTimeout(`${API_BASE}/datarefs/${match.id}/value`);
			if (!r2.ok) return { state: "error" };
			const valBody = await r2.json();
			return { state: "ok", value: valBody?.data };
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
				return "X-Plane unreachable";
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
	};
})();
