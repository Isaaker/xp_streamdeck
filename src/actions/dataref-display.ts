import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { DISCONNECTED_TITLE, NOT_FOUND_TITLE } from "../util/error-tile";
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
			await state.action.setTitle("");
			return;
		}

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
			streamDeck.logger.warn(`dataref-display: subscribe failed for ${state.path}`, err);
			await state.action.setTitle(NOT_FOUND_TITLE);
			await state.action.showAlert();
		}
	}

	private render(state: ActionState): void {
		if (state.lastValue === undefined) return;
		const text = formatDataRefValue(state.lastValue, {
			format: state.format,
			unitScale: state.unitScale,
			precision: state.precision,
		});
		state.action
			.setTitle(text)
			.catch((err) => streamDeck.logger.warn("dataref-display: setTitle failed", err));
	}

	private onXPlaneDisconnected(): void {
		for (const state of this.states.values()) {
			if (!state.path) continue;
			state.action
				.setTitle(DISCONNECTED_TITLE)
				.catch((err) => streamDeck.logger.warn("dataref-display: setTitle failed", err));
			state.action
				.showAlert()
				.catch((err) => streamDeck.logger.warn("dataref-display: showAlert failed", err));
		}
	}

	private onXPlaneConnected(): void {
		// Existing handles auto-rebind via the multiplexer; the next dataref update
		// will refresh the title. Only states without a handle (subscription failed
		// because X-Plane was offline at onWillAppear) need to be re-attempted here.
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
