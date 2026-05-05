import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
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
import { formatDataRefValue } from "../util/format";
import type { DataRefValue, SubscriptionHandle, XPlaneClient } from "../xplane";

type DataRefDisplaySettings = JsonObject & {
	datarefPath?: string;
	format?: string;
	unitScale?: string | number;
	precision?: string | number;
};

interface ActionState {
	action: WillAppearEvent<DataRefDisplaySettings>["action"];
	path: string;
	format: string;
	unitScale?: number;
	precision?: number;
	userTitle: string;
	lastRenderedTitle: string;
	handle?: SubscriptionHandle;
	lastValue?: DataRefValue;
}

@action({ UUID: "com.robertw.xplane.dataref-display" })
export class XPlaneDataRefDisplay extends SingletonAction<DataRefDisplaySettings> {
	private readonly states = new Map<string, ActionState>();

	constructor(private readonly xplane: XPlaneClient) {
		super();
		this.xplane.on("disconnected", () => this.onXPlaneDisconnected());
		this.xplane.on("connected", () => this.onXPlaneConnected());
	}

	override async onWillAppear(ev: WillAppearEvent<DataRefDisplaySettings>): Promise<void> {
		const parsed = parseSettings(ev.payload.settings ?? {});
		const state: ActionState = {
			action: ev.action,
			path: parsed.path,
			format: parsed.format,
			unitScale: parsed.unitScale,
			precision: parsed.precision,
			userTitle: readPayloadTitle(ev.payload),
			lastRenderedTitle: "",
		};
		this.states.set(ev.action.id, state);
		await this.applySubscription(state);
	}

	override onWillDisappear(ev: WillDisappearEvent<DataRefDisplaySettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		if (state.handle) {
			this.xplane.unsubscribe(state.handle);
			state.handle = undefined;
		}
		this.states.delete(ev.action.id);
		return Promise.resolve();
	}

	override onTitleParametersDidChange(
		ev: TitleParametersDidChangeEvent<DataRefDisplaySettings>,
	): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		const incoming = ev.payload.title ?? "";
		// Stream Deck echoes our own setTitle() calls back through this event;
		// ignore them so we don't promote a rendered "ALT\n3000" string into
		// the user-title slot.
		if (incoming === state.lastRenderedTitle) return Promise.resolve();
		state.userTitle = extractUserTitle(incoming);
		state.lastRenderedTitle = "";
		this.render(state);
		return Promise.resolve();
	}

	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<DataRefDisplaySettings>,
	): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;

		const parsed = parseSettings(ev.payload.settings ?? {});
		const pathChanged = parsed.path !== state.path;

		state.format = parsed.format;
		state.unitScale = parsed.unitScale;
		state.precision = parsed.precision;

		if (pathChanged) {
			if (state.handle) {
				this.xplane.unsubscribe(state.handle);
				state.handle = undefined;
			}
			state.path = parsed.path;
			state.lastValue = undefined;
			await this.applySubscription(state);
			return;
		}

		this.render(state);
	}

	private async applySubscription(state: ActionState): Promise<void> {
		if (!state.path) {
			await this.applyTitle(state, state.userTitle);
			return;
		}

		if (this.xplane.status() !== "connected") {
			await this.applyTitle(state, combineTitle(state.userTitle, DISCONNECTED_SUFFIX));
			await state.action.showAlert();
			return;
		}

		try {
			state.handle = await this.xplane.subscribe(state.path, (value) => {
				state.lastValue = value;
				this.render(state);
			});
		} catch (err) {
			streamDeck.logger.warn(`dataref-display: subscribe failed for ${state.path}`, err);
			await this.applyTitle(state, combineTitle(state.userTitle, NOT_FOUND_SUFFIX));
			await state.action.showAlert();
		}
	}

	private render(state: ActionState): void {
		if (state.lastValue === undefined) return;
		const valueText = formatDataRefValue(state.lastValue, {
			format: state.format,
			unitScale: state.unitScale,
			precision: state.precision,
		});
		const title = combineTitle(state.userTitle, valueText);
		this.applyTitle(state, title).catch((err) =>
			streamDeck.logger.warn("dataref-display: setTitle failed", err),
		);
	}

	private async applyTitle(state: ActionState, text: string): Promise<void> {
		state.lastRenderedTitle = text;
		await state.action.setTitle(text);
	}

	private onXPlaneDisconnected(): void {
		for (const state of this.states.values()) {
			if (!state.path) continue;
			this.applyTitle(state, combineTitle(state.userTitle, DISCONNECTED_SUFFIX)).catch(
				(err) => streamDeck.logger.warn("dataref-display: setTitle failed", err),
			);
			state.action
				.showAlert()
				.catch((err) => streamDeck.logger.warn("dataref-display: showAlert failed", err));
		}
	}

	private onXPlaneConnected(): void {
		for (const state of this.states.values()) {
			if (state.path && !state.handle) {
				this.applySubscription(state).catch((err) =>
					streamDeck.logger.warn(
						`dataref-display: re-subscribe failed for ${state.path}`,
						err,
					),
				);
			}
		}
	}
}

function parseSettings(s: DataRefDisplaySettings): {
	path: string;
	format: string;
	unitScale?: number;
	precision?: number;
} {
	const path = s.datarefPath?.trim() ?? "";
	const formatRaw = s.format?.trim();
	const format = formatRaw && formatRaw.length > 0 ? formatRaw : "%s";
	return {
		path,
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
