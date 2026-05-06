import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { applyIndex, parseDataRefPath } from "../util/dataref-path";
import { clearOffline, combineTitle, NOT_FOUND_SUFFIX, setOffline } from "../util/error-tile";
import { formatDataRefValue } from "../util/format";
import type { DataRefValue, SubscriptionHandle, XPlaneClient } from "../xplane";

type DataRefDisplaySettings = JsonObject & {
	datarefPath?: string;
	label?: string;
	format?: string;
	unitScale?: string | number;
	precision?: string | number;
};

interface ActionState {
	action: WillAppearEvent<DataRefDisplaySettings>["action"];
	path: string;
	label: string;
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
		this.xplane.on("offline", () => this.onXPlaneOffline());
		this.xplane.on("online", () => this.onXPlaneOnline());
	}

	override async onWillAppear(ev: WillAppearEvent<DataRefDisplaySettings>): Promise<void> {
		const parsed = parseSettings(ev.payload.settings ?? {});
		const state: ActionState = {
			action: ev.action,
			path: parsed.path,
			label: parsed.label,
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

		state.label = parsed.label;
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
			await state.action.setTitle(state.label);
			return;
		}

		if (this.xplane.isOffline()) {
			await setOffline(state.action);
			return;
		}

		const { basePath, index } = parseDataRefPath(state.path);

		try {
			state.handle = await this.xplane.subscribe(basePath, (raw) => {
				try {
					state.lastValue = applyIndex(raw, index);
					this.render(state);
				} catch (err) {
					streamDeck.logger.warn(
						`dataref-display: index apply failed for ${state.path}`,
						err,
					);
					state.action
						.setTitle(combineTitle(state.label, NOT_FOUND_SUFFIX))
						.catch((e) =>
							streamDeck.logger.warn("dataref-display: setTitle failed", e),
						);
				}
			});
		} catch (err) {
			streamDeck.logger.warn(`dataref-display: subscribe failed for ${state.path}`, err);
			await state.action.setTitle(combineTitle(state.label, NOT_FOUND_SUFFIX));
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
		state.action
			.setTitle(combineTitle(state.label, valueText))
			.catch((err) => streamDeck.logger.warn("dataref-display: setTitle failed", err));
	}

	private onXPlaneOffline(): void {
		for (const state of this.states.values()) {
			if (!state.path) continue;
			// The subscription is already broken at this point — drop our handle
			// so the next "online" cleanly re-subscribes.
			if (state.handle) {
				this.xplane.unsubscribe(state.handle);
				state.handle = undefined;
			}
			state.lastValue = undefined;
			setOffline(state.action).catch((err) =>
				streamDeck.logger.warn("dataref-display: setOffline failed", err),
			);
		}
	}

	private onXPlaneOnline(): void {
		for (const state of this.states.values()) {
			if (!state.path) continue;
			// Restore the user's image; the title will repopulate on first
			// subscription update via render().
			clearOffline(state.action)
				.then(() => this.applySubscription(state))
				.catch((err) =>
					streamDeck.logger.warn(
						`dataref-display: re-subscribe failed for ${state.path}`,
						err,
					),
				);
		}
	}
}

function parseSettings(s: DataRefDisplaySettings): {
	path: string;
	label: string;
	format: string;
	unitScale?: number;
	precision?: number;
} {
	const path = s.datarefPath?.trim() ?? "";
	const label = s.label?.trim() ?? "";
	const formatRaw = s.format?.trim();
	const format = formatRaw && formatRaw.length > 0 ? formatRaw : "%s";
	return {
		path,
		label,
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
