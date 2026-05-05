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
	imageOff?: string;
	imageOn?: string;
	handle?: SubscriptionHandle;
	lastValue?: DataRefValue;
	currentState: number;
}

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
			imageOff: parsed.imageOff,
			imageOn: parsed.imageOn,
			currentState: STATE_OFF,
		};
		this.states.set(ev.action.id, state);
		await this.applyCustomImages(state);
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
		const imagesChanged =
			parsed.imageOff !== state.imageOff || parsed.imageOn !== state.imageOn;

		state.valueOff = parsed.valueOff;
		state.valueOn = parsed.valueOn;
		state.triggerMode = parsed.triggerMode;
		state.commandPath = parsed.commandPath;
		state.imageOff = parsed.imageOff;
		state.imageOn = parsed.imageOn;

		if (imagesChanged) {
			await this.applyCustomImages(state);
		}

		if (pathChanged) {
			this.dropSubscription(state);
			state.path = parsed.path;
			state.lastValue = undefined;
			await this.applySubscription(state);
			return;
		}

		if (state.lastValue !== undefined) {
			await this.renderState(state, state.lastValue);
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

	private async applyCustomImages(state: ActionState): Promise<void> {
		await state.action.setImage(state.imageOff, { state: STATE_OFF });
		await state.action.setImage(state.imageOn, { state: STATE_ON });
	}

	private async applySubscription(state: ActionState): Promise<void> {
		if (!state.path) return;

		if (this.xplane.status() !== "connected") {
			await state.action.showAlert();
			return;
		}

		try {
			state.handle = await this.xplane.subscribe(state.path, (value) => {
				state.lastValue = value;
				this.renderState(state, value).catch((err) =>
					streamDeck.logger.warn("dataref-toggle: render failed", err),
				);
			});
		} catch (err) {
			streamDeck.logger.warn(`dataref-toggle: subscribe failed for ${state.path}`, err);
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
		state.currentState = target;
		await state.action.setState(target);
	}

	private onXPlaneDisconnected(): void {
		for (const state of this.states.values()) {
			if (!state.path) continue;
			state.action
				.showAlert()
				.catch((err) => streamDeck.logger.warn("dataref-toggle: showAlert failed", err));
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
