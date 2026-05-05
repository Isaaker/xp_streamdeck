import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { DISCONNECTED_TITLE, NOT_FOUND_TITLE } from "../util/error-tile";
import { formatDataRefValue } from "../util/format";
import type { DataRefValue, SubscriptionHandle, XPlaneClient } from "../xplane";

type DataRefWriteSettings = JsonObject & {
	datarefPath?: string;
	value?: string | number;
	hideConfirmation?: boolean;
	showCurrentValue?: boolean;
	format?: string;
	unitScale?: string | number;
	precision?: string | number;
};

interface ActionState {
	action: WillAppearEvent<DataRefWriteSettings>["action"];
	path: string;
	showCurrentValue: boolean;
	format: string;
	unitScale?: number;
	precision?: number;
	handle?: SubscriptionHandle;
	lastValue?: DataRefValue;
}

@action({ UUID: "com.robertw.xplane.dataref-write" })
export class XPlaneDataRefWrite extends SingletonAction<DataRefWriteSettings> {
	private readonly states = new Map<string, ActionState>();

	constructor(private readonly xplane: XPlaneClient) {
		super();
		this.xplane.on("disconnected", () => this.onXPlaneDisconnected());
		this.xplane.on("connected", () => this.onXPlaneConnected());
	}

	override async onWillAppear(ev: WillAppearEvent<DataRefWriteSettings>): Promise<void> {
		const parsed = parseSettings(ev.payload.settings ?? {});
		const state: ActionState = {
			action: ev.action,
			path: parsed.path,
			showCurrentValue: parsed.showCurrentValue,
			format: parsed.format,
			unitScale: parsed.unitScale,
			precision: parsed.precision,
		};
		this.states.set(ev.action.id, state);
		await this.applySubscription(state);
	}

	override onWillDisappear(ev: WillDisappearEvent<DataRefWriteSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		this.dropSubscription(state);
		this.states.delete(ev.action.id);
		return Promise.resolve();
	}

	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<DataRefWriteSettings>,
	): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;

		const parsed = parseSettings(ev.payload.settings ?? {});
		const pathChanged = parsed.path !== state.path;
		const displayChanged = parsed.showCurrentValue !== state.showCurrentValue;

		state.format = parsed.format;
		state.unitScale = parsed.unitScale;
		state.precision = parsed.precision;

		if (pathChanged || displayChanged) {
			this.dropSubscription(state);
			state.path = parsed.path;
			state.showCurrentValue = parsed.showCurrentValue;
			state.lastValue = undefined;
			if (!state.showCurrentValue) {
				await state.action.setTitle("");
			}
			await this.applySubscription(state);
			return;
		}

		this.render(state);
	}

	override async onKeyDown(ev: KeyDownEvent<DataRefWriteSettings>): Promise<void> {
		const settings = ev.payload.settings ?? {};
		const path = settings.datarefPath?.trim();
		const value = toFiniteNumber(settings.value);
		const hideConfirmation = settings.hideConfirmation === true;

		if (!path) {
			streamDeck.logger.warn("dataref-write: datarefPath is empty");
			await ev.action.showAlert();
			return;
		}
		if (value === undefined) {
			streamDeck.logger.warn(`dataref-write: value is empty/invalid for ${path}`);
			await ev.action.showAlert();
			return;
		}

		try {
			const id = await this.xplane.getDataRefId(path);
			await this.xplane.writeDataRef(id, value);
			streamDeck.logger.info(`dataref-write: ${path} = ${value} (id=${id})`);
			if (!hideConfirmation) {
				await ev.action.showOk();
			}
		} catch (err) {
			streamDeck.logger.error(`dataref-write failed: ${path} = ${value}`, err);
			await ev.action.showAlert();
		}
	}

	private async applySubscription(state: ActionState): Promise<void> {
		if (!state.showCurrentValue || !state.path) return;

		if (this.xplane.status() !== "connected") {
			await state.action.setTitle(DISCONNECTED_TITLE);
			await state.action.showAlert();
			return;
		}

		try {
			state.handle = await this.xplane.subscribe(state.path, (value) => {
				state.lastValue = value;
				this.render(state);
			});
		} catch (err) {
			streamDeck.logger.warn(`dataref-write: subscribe failed for ${state.path}`, err);
			await state.action.setTitle(NOT_FOUND_TITLE);
			await state.action.showAlert();
		}
	}

	private dropSubscription(state: ActionState): void {
		if (state.handle) {
			this.xplane.unsubscribe(state.handle);
			state.handle = undefined;
		}
	}

	private render(state: ActionState): void {
		if (!state.showCurrentValue) return;
		if (state.lastValue === undefined) return;
		const text = formatDataRefValue(state.lastValue, {
			format: state.format,
			unitScale: state.unitScale,
			precision: state.precision,
		});
		state.action
			.setTitle(text)
			.catch((err) => streamDeck.logger.warn("dataref-write: setTitle failed", err));
	}

	private onXPlaneDisconnected(): void {
		for (const state of this.states.values()) {
			if (!state.showCurrentValue || !state.path) continue;
			state.action
				.setTitle(DISCONNECTED_TITLE)
				.catch((err) => streamDeck.logger.warn("dataref-write: setTitle failed", err));
			state.action
				.showAlert()
				.catch((err) => streamDeck.logger.warn("dataref-write: showAlert failed", err));
		}
	}

	private onXPlaneConnected(): void {
		for (const state of this.states.values()) {
			if (state.showCurrentValue && state.path && !state.handle) {
				this.applySubscription(state).catch((err) =>
					streamDeck.logger.warn(
						`dataref-write: re-subscribe failed for ${state.path}`,
						err,
					),
				);
			}
		}
	}
}

function parseSettings(s: DataRefWriteSettings): {
	path: string;
	showCurrentValue: boolean;
	format: string;
	unitScale?: number;
	precision?: number;
} {
	const path = s.datarefPath?.trim() ?? "";
	const formatRaw = s.format?.trim();
	const format = formatRaw && formatRaw.length > 0 ? formatRaw : "%s";
	return {
		path,
		showCurrentValue: s.showCurrentValue === true,
		format,
		unitScale: toFiniteNumber(s.unitScale),
		precision: toFiniteNumber(s.precision),
	};
}

function toFiniteNumber(v: unknown): number | undefined {
	if (v === undefined || v === null || v === "") return undefined;
	const n = typeof v === "number" ? v : Number(v);
	return Number.isFinite(n) ? n : undefined;
}
