import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	SingletonAction,
	type TitleParametersDidChangeEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import {
	combineTitle,
	DISCONNECTED_SUFFIX,
	extractUserTitle,
	NOT_FOUND_SUFFIX,
	readPayloadTitle,
} from "../util/error-tile";
import { persistImage } from "../util/image-cache";
import type { DataRefValue, SubscriptionHandle, XPlaneClient } from "../xplane";

type TriggerMode = "write" | "command";

type DataRefToggleSettings = JsonObject & {
	datarefPath?: string;
	valueOff?: string | number;
	valueOn?: string | number;
	triggerMode?: TriggerMode;
	commandPath?: string;
	imageOff?: string;
	imageOn?: string;
};

const STATE_OFF = 0;
const STATE_ON = 1;

interface ParsedSettings {
	path: string;
	valueOff: number;
	valueOn: number;
	triggerMode: TriggerMode;
	commandPath: string;
	imageOff?: string;
	imageOn?: string;
}

interface ActionState {
	action: KeyAction<DataRefToggleSettings>;
	path: string;
	valueOff: number;
	valueOn: number;
	triggerMode: TriggerMode;
	commandPath: string;
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
	userTitle: string;
	lastRenderedTitle: string;
	handle?: SubscriptionHandle;
	lastValue?: DataRefValue;
	currentState: number;
}

const DEFAULT_IMAGE_OFF = "imgs/states/off";
const DEFAULT_IMAGE_ON = "imgs/states/on";

const UNINITIALIZED_STATE = -1;

@action({ UUID: "com.robertw.xplane.dataref-toggle" })
export class XPlaneDataRefToggle extends SingletonAction<DataRefToggleSettings> {
	private readonly states = new Map<string, ActionState>();

	constructor(private readonly xplane: XPlaneClient) {
		super();
		this.xplane.on("disconnected", () => this.onXPlaneDisconnected());
		this.xplane.on("connected", () => this.onXPlaneConnected());
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
			userTitle: readPayloadTitle(ev.payload),
			lastRenderedTitle: "",
			currentState: UNINITIALIZED_STATE,
		};
		this.states.set(ev.action.id, state);
		await this.syncImages(ev.action.id, state, parsed);
		await this.applySubscription(state);
	}

	override onTitleParametersDidChange(
		ev: TitleParametersDidChangeEvent<DataRefToggleSettings>,
	): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		const incoming = ev.payload.title ?? "";
		if (incoming === state.lastRenderedTitle) return Promise.resolve();
		state.userTitle = extractUserTitle(incoming);
		state.lastRenderedTitle = "";
		// Force the next renderState to re-apply the title alongside state/image.
		state.currentState = UNINITIALIZED_STATE;
		if (state.lastValue !== undefined) {
			this.renderState(state, state.lastValue).catch((err) =>
				streamDeck.logger.warn("dataref-toggle: re-render after title change failed", err),
			);
		}
		return Promise.resolve();
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
			} else {
				const drId = await this.xplane.getDataRefId(parsed.path);
				const current =
					state?.lastValue !== undefined
						? state.lastValue
						: await this.xplane.readDataRef(drId);
				const isOn =
					mapValueToStateIndex(current, parsed.valueOff, parsed.valueOn) === STATE_ON;
				const target = isOn ? parsed.valueOff : parsed.valueOn;
				await this.xplane.writeDataRef(drId, target);
				streamDeck.logger.info(
					`dataref-toggle: write ${parsed.path} = ${target} (id=${drId})`,
				);
			}
		} catch (err) {
			streamDeck.logger.error("dataref-toggle keyDown failed", err);
			await ev.action.showAlert();
		}
	}

	private async applyTitle(state: ActionState, text: string): Promise<void> {
		state.lastRenderedTitle = text;
		await state.action.setTitle(text);
	}

	private async applySubscription(state: ActionState): Promise<void> {
		if (!state.path) return;

		if (this.xplane.status() !== "connected") {
			await this.applyTitle(state, combineTitle(state.userTitle, DISCONNECTED_SUFFIX));
			return;
		}

		try {
			state.handle = await this.xplane.subscribe(state.path, (value) => {
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
			try {
				const id = await this.xplane.getDataRefId(state.path);
				const initial = await this.xplane.readDataRef(id);
				state.lastValue = initial;
				await this.renderState(state, initial);
			} catch (err) {
				streamDeck.logger.warn(
					`dataref-toggle: initial read failed for ${state.path}`,
					err,
				);
			}
		} catch (err) {
			streamDeck.logger.warn(`dataref-toggle: subscribe failed for ${state.path}`, err);
			await this.applyTitle(state, combineTitle(state.userTitle, NOT_FOUND_SUFFIX));
			await state.action.showAlert();
		}
	}

	private dropSubscription(state: ActionState): void {
		if (state.handle) {
			this.xplane.unsubscribe(state.handle);
			state.handle = undefined;
		}
	}

	private async renderState(state: ActionState, value: DataRefValue): Promise<void> {
		const target = mapValueToStateIndex(value, state.valueOff, state.valueOn);
		if (target === state.currentState) return;
		streamDeck.logger.info(
			`dataref-toggle: setState ${target} for ${state.path} (value=${describeValue(value)}, off=${state.valueOff}, on=${state.valueOn})`,
		);
		state.currentState = target;
		// Once we have valid data, drop any disconnected/not-found overlay
		// while preserving the user-provided title label.
		await this.applyTitle(state, state.userTitle);
		await state.action.setState(target);

		// Stream Deck does not always refresh the visible image after setState
		// alone on multi-state keys, so we explicitly push the active image
		// (custom data URL if uploaded, otherwise the manifest path). This
		// targets the *currently displayed* state because we just switched to
		// `target`, which is why we omit the { state } option here.
		const customImage = target === STATE_ON ? state.imageOn : state.imageOff;
		const image = customImage ?? (target === STATE_ON ? DEFAULT_IMAGE_ON : DEFAULT_IMAGE_OFF);
		await state.action.setImage(image);
	}

	private onXPlaneDisconnected(): void {
		for (const state of this.states.values()) {
			if (!state.path) continue;
			// Force the next renderState to push state+image again so the
			// "X-Plane" title overlay is cleanly replaced on reconnect.
			state.currentState = UNINITIALIZED_STATE;
			this.applyTitle(state, combineTitle(state.userTitle, DISCONNECTED_SUFFIX)).catch(
				(err) => streamDeck.logger.warn("dataref-toggle: setDisconnected failed", err),
			);
		}
	}

	private onXPlaneConnected(): void {
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
	const triggerMode: TriggerMode = s.triggerMode === "command" ? "command" : "write";
	const commandPath = s.commandPath?.trim() ?? "";
	const imageOff =
		typeof s.imageOff === "string" && s.imageOff.length > 0 ? s.imageOff : undefined;
	const imageOn = typeof s.imageOn === "string" && s.imageOn.length > 0 ? s.imageOn : undefined;
	return { path, valueOff, valueOn, triggerMode, commandPath, imageOff, imageOn };
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
): typeof STATE_OFF | typeof STATE_ON {
	const num = coerceNumber(value);
	if (num === undefined) return STATE_OFF;
	if (valueOff === 0 && valueOn === 1) {
		return num >= 0.5 ? STATE_ON : STATE_OFF;
	}
	const dOff = Math.abs(num - valueOff);
	const dOn = Math.abs(num - valueOn);
	return dOn < dOff ? STATE_ON : STATE_OFF;
}
