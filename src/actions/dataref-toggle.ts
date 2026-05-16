import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { applyIndex, parseDataRefPath } from "../util/dataref-path";
import { clearTile, setNotFound, setOffline } from "../util/error-tile";
import { persistImage } from "../util/image-cache";
import type { DataRefValue, SubscriptionHandle, XPlaneClient } from "../xplane";

type TriggerMode = "write" | "command" | "command-on-off";

type DataRefToggleSettings = JsonObject & {
	datarefPath?: string;
	valueOff?: string | number;
	valueOn?: string | number;
	triggerMode?: TriggerMode;
	commandPath?: string;
	commandOnPath?: string;
	commandOffPath?: string;
	imageOff?: string;
	imageOn?: string;
	strictOnMatch?: boolean;
};

const STATE_OFF = 0;
const STATE_ON = 1;

interface ParsedSettings {
	path: string;
	valueOff: number;
	valueOn: number;
	triggerMode: TriggerMode;
	commandPath: string;
	commandOnPath: string;
	commandOffPath: string;
	imageOff?: string;
	imageOn?: string;
	strictOnMatch: boolean;
}

interface ActionState {
	action: KeyAction<DataRefToggleSettings>;
	path: string;
	valueOff: number;
	valueOn: number;
	triggerMode: TriggerMode;
	commandPath: string;
	commandOnPath: string;
	commandOffPath: string;
	strictOnMatch: boolean;
	// Resolved paths (or pass-through values) ready for setImage. Data URLs
	// from settings are persisted to disk as files via persistImage so we
	// hand Stream Deck a real path — Data URLs on multi-state actions have
	// proven unreliable.
	imageOff?: string;
	imageOn?: string;
	// Last raw setting values seen, used to detect changes and avoid
	// re-persisting an unchanged image.
	imageOffRaw?: string;
	imageOnRaw?: string;
	handle?: SubscriptionHandle;
	lastValue?: DataRefValue;
	currentState: number;
	// Guards against a second keyDown firing while the previous toggle is
	// still in flight — without it, a fast double-click reads the same stale
	// subscription cache twice and sends the same command twice.
	inflightKeyDown: boolean;
	// Serializes overlapping renderState() calls so setState + setImage from
	// an earlier update can't interleave with a newer one.
	renderPromise?: Promise<void>;
}

const DEFAULT_IMAGE_OFF = "imgs/states/off";
const DEFAULT_IMAGE_ON = "imgs/states/on";

const UNINITIALIZED_STATE = -1;

@action({ UUID: "com.robertw.xplane.dataref-toggle" })
export class XPlaneDataRefToggle extends SingletonAction<DataRefToggleSettings> {
	private readonly states = new Map<string, ActionState>();

	constructor(private readonly xplane: XPlaneClient) {
		super();
		this.xplane.on("offline", () => this.onXPlaneOffline());
		this.xplane.on("online", () => this.onXPlaneOnline());
	}

	override async onWillAppear(ev: WillAppearEvent<DataRefToggleSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const parsed = parseSettings(ev.payload.settings ?? {});
		const state: ActionState = {
			action: ev.action,
			path: parsed.path,
			valueOff: parsed.valueOff,
			valueOn: parsed.valueOn,
			triggerMode: parsed.triggerMode,
			commandPath: parsed.commandPath,
			commandOnPath: parsed.commandOnPath,
			commandOffPath: parsed.commandOffPath,
			strictOnMatch: parsed.strictOnMatch,
			currentState: UNINITIALIZED_STATE,
			inflightKeyDown: false,
		};
		this.states.set(ev.action.id, state);
		await this.syncImages(ev.action.id, state, parsed);
		await this.applySubscription(state);
	}

	override onWillDisappear(ev: WillDisappearEvent<DataRefToggleSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		this.dropSubscription(state);
		this.states.delete(ev.action.id);
		return Promise.resolve();
	}

	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<DataRefToggleSettings>,
	): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;

		const parsed = parseSettings(ev.payload.settings ?? {});
		const pathChanged = parsed.path !== state.path;

		state.valueOff = parsed.valueOff;
		state.valueOn = parsed.valueOn;
		state.triggerMode = parsed.triggerMode;
		state.commandPath = parsed.commandPath;
		state.commandOnPath = parsed.commandOnPath;
		state.commandOffPath = parsed.commandOffPath;
		state.strictOnMatch = parsed.strictOnMatch;
		await this.syncImages(ev.action.id, state, parsed);

		if (pathChanged) {
			this.dropSubscription(state);
			state.path = parsed.path;
			state.lastValue = undefined;
			state.currentState = UNINITIALIZED_STATE;
			await this.applySubscription(state);
			return;
		}

		// Force a re-render so changed off/on thresholds and image overrides
		// take effect immediately.
		state.currentState = UNINITIALIZED_STATE;
		if (state.lastValue !== undefined) {
			await this.renderState(state, state.lastValue);
		}
	}

	private async syncImages(
		actionId: string,
		state: ActionState,
		parsed: ParsedSettings,
	): Promise<void> {
		if (parsed.imageOff !== state.imageOffRaw) {
			state.imageOffRaw = parsed.imageOff;
			try {
				state.imageOff = await persistImage(actionId, "off", parsed.imageOff);
			} catch (err) {
				streamDeck.logger.warn("dataref-toggle: persistImage off failed", err);
				state.imageOff = parsed.imageOff;
			}
		}
		if (parsed.imageOn !== state.imageOnRaw) {
			state.imageOnRaw = parsed.imageOn;
			try {
				state.imageOn = await persistImage(actionId, "on", parsed.imageOn);
			} catch (err) {
				streamDeck.logger.warn("dataref-toggle: persistImage on failed", err);
				state.imageOn = parsed.imageOn;
			}
		}
	}

	override async onKeyDown(ev: KeyDownEvent<DataRefToggleSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		const parsed = parseSettings(ev.payload.settings ?? {});

		if (!parsed.path) {
			streamDeck.logger.warn("dataref-toggle: datarefPath is empty");
			await ev.action.showAlert();
			return;
		}

		if (state?.inflightKeyDown) {
			streamDeck.logger.info(
				`dataref-toggle: ignoring keyDown while previous toggle is in flight for ${parsed.path}`,
			);
			await ev.action.showAlert();
			return;
		}
		if (state) state.inflightKeyDown = true;

		try {
			if (parsed.triggerMode === "command") {
				if (!parsed.commandPath) {
					streamDeck.logger.warn("dataref-toggle: commandPath is empty in command mode");
					await ev.action.showAlert();
					return;
				}
				const cmdId = await this.xplane.getCommandId(parsed.commandPath);
				await this.xplane.activateCommand(cmdId);
				streamDeck.logger.info(
					`dataref-toggle: command activate ${parsed.commandPath} (id=${cmdId})`,
				);
				// No optimistic update — for a generic command we cannot predict
				// the resulting DataRef value, so we wait for the WS update.
			} else if (parsed.triggerMode === "command-on-off") {
				const { basePath, index } = parseDataRefPath(parsed.path);
				const drId = await this.xplane.getDataRefId(basePath);
				const current =
					state?.lastValue !== undefined
						? state.lastValue
						: applyIndex(await this.xplane.readDataRef(drId), index);
				const isOn =
					mapValueToStateIndex(
						current,
						parsed.valueOff,
						parsed.valueOn,
						parsed.strictOnMatch,
					) === STATE_ON;
				const targetPath = isOn ? parsed.commandOffPath : parsed.commandOnPath;
				if (!targetPath) {
					streamDeck.logger.warn(
						`dataref-toggle: ${isOn ? "commandOffPath" : "commandOnPath"} is empty in on-off command mode`,
					);
					await ev.action.showAlert();
					return;
				}
				const cmdId = await this.xplane.getCommandId(targetPath);
				await this.xplane.activateCommand(cmdId);
				streamDeck.logger.info(
					`dataref-toggle: on-off command activate ${targetPath} (id=${cmdId}, isOn=${isOn})`,
				);
				if (state) {
					const target = isOn ? parsed.valueOff : parsed.valueOn;
					state.lastValue = target;
					await this.renderState(state, target);
				}
			} else {
				const { basePath, index } = parseDataRefPath(parsed.path);
				const drId = await this.xplane.getDataRefId(basePath);
				const current =
					state?.lastValue !== undefined
						? state.lastValue
						: applyIndex(await this.xplane.readDataRef(drId), index);
				const isOn =
					mapValueToStateIndex(
						current,
						parsed.valueOff,
						parsed.valueOn,
						parsed.strictOnMatch,
					) === STATE_ON;
				const target = isOn ? parsed.valueOff : parsed.valueOn;
				await this.xplane.writeDataRef(drId, target, index);
				streamDeck.logger.info(
					`dataref-toggle: write ${parsed.path} = ${target} (id=${drId})`,
				);
				if (state) {
					state.lastValue = target;
					await this.renderState(state, target);
				}
			}
		} catch (err) {
			streamDeck.logger.error("dataref-toggle keyDown failed", err);
			await ev.action.showAlert();
		} finally {
			if (state) state.inflightKeyDown = false;
		}
	}

	private async applySubscription(state: ActionState): Promise<void> {
		if (!state.path) return;

		if (this.xplane.isOffline()) {
			await setOffline(state.action);
			return;
		}

		const { basePath, index } = parseDataRefPath(state.path);

		try {
			state.handle = await this.xplane.subscribe(basePath, (raw) => {
				let value: DataRefValue;
				try {
					value = applyIndex(raw, index);
				} catch (err) {
					streamDeck.logger.warn(
						`dataref-toggle: index apply failed for ${state.path}`,
						err,
					);
					setNotFound(state.action).catch((e) =>
						streamDeck.logger.warn("dataref-toggle: setNotFound failed", e),
					);
					return;
				}
				const prev = state.lastValue;
				state.lastValue = value;
				if (!sameValue(prev, value)) {
					streamDeck.logger.info(
						`dataref-toggle: subscribe ${state.path} = ${describeValue(value)}`,
					);
				}
				this.renderState(state, value).catch((err) =>
					streamDeck.logger.warn("dataref-toggle: render failed", err),
				);
			});

			// Seed the visible state immediately via REST so the first frame is
			// correct even before the subscription delivers its first update.
			// Skip if the WS subscription has already delivered a value — that
			// is the fresher source of truth and must not be clobbered by a
			// stale REST read that started before the WS update arrived.
			try {
				const id = await this.xplane.getDataRefId(basePath);
				const initial = applyIndex(await this.xplane.readDataRef(id), index);
				if (state.lastValue === undefined) {
					state.lastValue = initial;
					await this.renderState(state, initial);
				}
			} catch (err) {
				streamDeck.logger.warn(
					`dataref-toggle: initial read failed for ${state.path}`,
					err,
				);
			}
		} catch (err) {
			streamDeck.logger.warn(`dataref-toggle: subscribe failed for ${state.path}`, err);
			await setNotFound(state.action);
			await state.action.showAlert();
		}
	}

	private dropSubscription(state: ActionState): void {
		if (state.handle) {
			this.xplane.unsubscribe(state.handle);
			state.handle = undefined;
		}
	}

	private renderState(state: ActionState, value: DataRefValue): Promise<void> {
		const target = mapValueToStateIndex(
			value,
			state.valueOff,
			state.valueOn,
			state.strictOnMatch,
		);
		// Chain off any in-flight render so setState + setImage from an earlier
		// update can't interleave with this one. Use a swallowing catch so a
		// prior failure doesn't block subsequent renders.
		const previous = state.renderPromise ?? Promise.resolve();
		const next = previous
			.catch(() => {
				/* prior render error already logged; don't propagate */
			})
			.then(async () => {
				if (target === state.currentState) return;
				streamDeck.logger.info(
					`dataref-toggle: setState ${target} for ${state.path} (value=${describeValue(value)}, off=${state.valueOff}, on=${state.valueOn}, strict=${state.strictOnMatch})`,
				);
				// Once we have valid data, drop any disconnected/not-found overlay.
				await clearTile(state.action);
				await state.action.setState(target);

				// Stream Deck does not always refresh the visible image after setState
				// alone on multi-state keys, so we explicitly push the active image
				// (custom data URL if uploaded, otherwise the manifest path). This
				// targets the *currently displayed* state because we just switched to
				// `target`, which is why we omit the { state } option here.
				const customImage = target === STATE_ON ? state.imageOn : state.imageOff;
				const image =
					customImage ?? (target === STATE_ON ? DEFAULT_IMAGE_ON : DEFAULT_IMAGE_OFF);
				await state.action.setImage(image);
				// Only commit currentState after the hardware confirms — keeps the
				// early-exit guard above honest if a follow-up render races.
				state.currentState = target;
			});
		state.renderPromise = next;
		return next;
	}

	private onXPlaneOffline(): void {
		for (const state of this.states.values()) {
			if (!state.path) continue;
			// Drop the (already-broken) subscription so the next "online" cleanly
			// re-subscribes, and force renderState to re-push state+image on
			// the next live update so the offline placeholder gets replaced.
			this.dropSubscription(state);
			state.currentState = UNINITIALIZED_STATE;
			setOffline(state.action).catch((err) =>
				streamDeck.logger.warn("dataref-toggle: setOffline failed", err),
			);
		}
	}

	private onXPlaneOnline(): void {
		for (const state of this.states.values()) {
			if (state.path && !state.handle) {
				this.applySubscription(state).catch((err) =>
					streamDeck.logger.warn(
						`dataref-toggle: re-subscribe failed for ${state.path}`,
						err,
					),
				);
			}
		}
	}
}

function parseSettings(s: DataRefToggleSettings): ParsedSettings {
	const path = s.datarefPath?.trim() ?? "";
	const valueOff = toFiniteNumber(s.valueOff) ?? 0;
	const valueOn = toFiniteNumber(s.valueOn) ?? 1;
	const triggerMode: TriggerMode =
		s.triggerMode === "command"
			? "command"
			: s.triggerMode === "command-on-off"
				? "command-on-off"
				: "write";
	const commandPath = s.commandPath?.trim() ?? "";
	const commandOnPath = s.commandOnPath?.trim() ?? "";
	const commandOffPath = s.commandOffPath?.trim() ?? "";
	const imageOff =
		typeof s.imageOff === "string" && s.imageOff.length > 0 ? s.imageOff : undefined;
	const imageOn = typeof s.imageOn === "string" && s.imageOn.length > 0 ? s.imageOn : undefined;
	const strictOnMatch = s.strictOnMatch === true;
	return {
		path,
		valueOff,
		valueOn,
		triggerMode,
		commandPath,
		commandOnPath,
		commandOffPath,
		imageOff,
		imageOn,
		strictOnMatch,
	};
}

function toFiniteNumber(v: unknown): number | undefined {
	if (v === undefined || v === null || v === "") return undefined;
	const n = typeof v === "number" ? v : Number(v);
	return Number.isFinite(n) ? n : undefined;
}

function coerceNumber(v: DataRefValue): number | undefined {
	if (typeof v === "number") return v;
	if (typeof v === "boolean") return v ? 1 : 0;
	if (typeof v === "string") {
		const n = Number(v);
		return Number.isFinite(n) ? n : undefined;
	}
	if (Array.isArray(v) && v.length > 0 && typeof v[0] === "number") return v[0];
	return undefined;
}

function describeValue(v: DataRefValue): string {
	if (Array.isArray(v)) return `[${v.slice(0, 4).join(",")}${v.length > 4 ? ",…" : ""}]`;
	return `${v} (${typeof v})`;
}

function sameValue(a: DataRefValue | undefined, b: DataRefValue): boolean {
	if (a === undefined) return false;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return false;
		}
		return true;
	}
	return a === b;
}

function mapValueToStateIndex(
	value: DataRefValue,
	valueOff: number,
	valueOn: number,
	strictOnMatch: boolean,
): typeof STATE_OFF | typeof STATE_ON {
	const num = coerceNumber(value);
	if (num === undefined) return STATE_OFF;
	if (strictOnMatch) {
		// Tolerance to absorb X-Plane occasionally returning integer modes as
		// floats (e.g. 3.0). Harmless for clean integers.
		return Math.abs(num - valueOn) < 1e-6 ? STATE_ON : STATE_OFF;
	}
	if (valueOff === 0 && valueOn === 1) {
		return num >= 0.5 ? STATE_ON : STATE_OFF;
	}
	const dOff = Math.abs(num - valueOff);
	const dOn = Math.abs(num - valueOn);
	return dOn < dOff ? STATE_ON : STATE_OFF;
}
