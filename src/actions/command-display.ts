import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { applyIndex, parseDataRefPath } from "../util/dataref-path";
import { clearOffline, combineTitle, NOT_FOUND_SUFFIX, setOffline } from "../util/error-tile";
import { formatDataRefValue } from "../util/format";
import type { DataRefValue, SubscriptionHandle, XPlaneClient } from "../xplane";

type CommandDisplaySettings = JsonObject & {
	commandPath?: string;
	hideConfirmation?: boolean;
	datarefPath?: string;
	label?: string;
	format?: string;
	unitScale?: string | number;
	precision?: string | number;
};

interface ActionState {
	action: WillAppearEvent<CommandDisplaySettings>["action"];
	path: string;
	label: string;
	format: string;
	unitScale?: number;
	precision?: number;
	handle?: SubscriptionHandle;
	lastValue?: DataRefValue;
}

@action({ UUID: "com.robertw.xplane.command-display" })
export class XPlaneCommandDisplay extends SingletonAction<CommandDisplaySettings> {
	private readonly states = new Map<string, ActionState>();

	constructor(private readonly xplane: XPlaneClient) {
		super();
		this.xplane.on("offline", () => this.onXPlaneOffline());
		this.xplane.on("online", () => this.onXPlaneOnline());
	}

	override async onWillAppear(ev: WillAppearEvent<CommandDisplaySettings>): Promise<void> {
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

		if (this.xplane.isOffline()) {
			await setOffline(ev.action);
			return;
		}
		await this.applySubscription(state);
	}

	override onWillDisappear(ev: WillDisappearEvent<CommandDisplaySettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		this.dropSubscription(state);
		this.states.delete(ev.action.id);
		return Promise.resolve();
	}

	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<CommandDisplaySettings>,
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
			this.dropSubscription(state);
			state.path = parsed.path;
			state.lastValue = undefined;
			if (!state.path) {
				await state.action.setTitle(state.label);
			}
			await this.applySubscription(state);
			return;
		}

		this.render(state);
	}

	override async onKeyDown(ev: KeyDownEvent<CommandDisplaySettings>): Promise<void> {
		const path = ev.payload.settings?.commandPath?.trim();
		const hideConfirmation = ev.payload.settings?.hideConfirmation === true;

		if (!path) {
			streamDeck.logger.warn("command-display: commandPath is empty");
			await ev.action.showAlert();
			return;
		}

		try {
			const id = await this.xplane.getCommandId(path);
			await this.xplane.activateCommand(id);
			streamDeck.logger.info(`command-display: activate ${path} (id=${id})`);
			if (!hideConfirmation) {
				await ev.action.showOk();
			}
		} catch (err) {
			streamDeck.logger.error(`command-display: command failed: ${path}`, err);
			await ev.action.showAlert();
		}
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
						`command-display: index apply failed for ${state.path}`,
						err,
					);
					state.action
						.setTitle(combineTitle(state.label, NOT_FOUND_SUFFIX))
						.catch((e) =>
							streamDeck.logger.warn("command-display: setTitle failed", e),
						);
				}
			});
		} catch (err) {
			streamDeck.logger.warn(`command-display: subscribe failed for ${state.path}`, err);
			await state.action.setTitle(combineTitle(state.label, NOT_FOUND_SUFFIX));
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
		if (state.lastValue === undefined) return;
		const valueText = formatDataRefValue(state.lastValue, {
			format: state.format,
			unitScale: state.unitScale,
			precision: state.precision,
		});
		state.action
			.setTitle(combineTitle(state.label, valueText))
			.catch((err) => streamDeck.logger.warn("command-display: setTitle failed", err));
	}

	private onXPlaneOffline(): void {
		for (const state of this.states.values()) {
			this.dropSubscription(state);
			state.lastValue = undefined;
			setOffline(state.action).catch((err) =>
				streamDeck.logger.warn("command-display: setOffline failed", err),
			);
		}
	}

	private onXPlaneOnline(): void {
		for (const state of this.states.values()) {
			clearOffline(state.action)
				.then(() => this.applySubscription(state))
				.catch((err) =>
					streamDeck.logger.warn("command-display: re-subscribe failed", err),
				);
		}
	}
}

function parseSettings(s: CommandDisplaySettings): {
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
