import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { coerceNumber } from "../util/coerce";
import { applyIndex, parseDataRefPath } from "../util/dataref-path";
import { clearOffline, setOffline } from "../util/error-tile";
import { renderWindDataUrl } from "../util/wind-svg";
import type { SubscriptionHandle, XPlaneClient } from "../xplane";

type ArrowConvention = "from" | "to";

type WindDisplaySettings = JsonObject & {
	label?: string;
	directionDataRef?: string;
	speedDataRef?: string;
	oatDataRef?: string;
	speedUnit?: string;
	arrowConvention?: ArrowConvention;
};

interface SlotState {
	path: string;
	handle?: SubscriptionHandle;
	lastValue?: number;
}

interface ActionState {
	action: WillAppearEvent<WindDisplaySettings>["action"];
	label: string;
	speedUnit: string;
	convention: ArrowConvention;
	dir: SlotState;
	speed: SlotState;
	oat: SlotState;
}

@action({ UUID: "com.robertw.xplane.wind-display" })
export class XPlaneWindDisplay extends SingletonAction<WindDisplaySettings> {
	private readonly states = new Map<string, ActionState>();

	constructor(private readonly xplane: XPlaneClient) {
		super();
		this.xplane.on("offline", () => this.onXPlaneOffline());
		this.xplane.on("online", () => this.onXPlaneOnline());
	}

	override async onWillAppear(ev: WillAppearEvent<WindDisplaySettings>): Promise<void> {
		const parsed = parseSettings(ev.payload.settings ?? {});
		const state: ActionState = {
			action: ev.action,
			label: parsed.label,
			speedUnit: parsed.speedUnit,
			convention: parsed.convention,
			dir: { path: parsed.directionPath },
			speed: { path: parsed.speedPath },
			oat: { path: parsed.oatPath },
		};
		this.states.set(ev.action.id, state);

		if (this.xplane.isOffline()) {
			await setOffline(ev.action);
			return;
		}
		await this.subscribeAll(state);
		this.render(state);
	}

	override onWillDisappear(ev: WillDisappearEvent<WindDisplaySettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		this.dropSlot(state.dir);
		this.dropSlot(state.speed);
		this.dropSlot(state.oat);
		this.states.delete(ev.action.id);
		return Promise.resolve();
	}

	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<WindDisplaySettings>,
	): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;
		const parsed = parseSettings(ev.payload.settings ?? {});
		state.label = parsed.label;
		state.speedUnit = parsed.speedUnit;
		state.convention = parsed.convention;
		await this.rebindIfChanged(state, state.dir, parsed.directionPath);
		await this.rebindIfChanged(state, state.speed, parsed.speedPath);
		await this.rebindIfChanged(state, state.oat, parsed.oatPath);
		this.render(state);
	}

	private async subscribeAll(state: ActionState): Promise<void> {
		await Promise.all([
			this.subscribeSlot(state, state.dir),
			this.subscribeSlot(state, state.speed),
			this.subscribeSlot(state, state.oat),
		]);
	}

	private async subscribeSlot(state: ActionState, slot: SlotState): Promise<void> {
		if (!slot.path) return;
		const { basePath, index } = parseDataRefPath(slot.path);
		try {
			slot.handle = await this.xplane.subscribe(basePath, (raw) => {
				try {
					const val = applyIndex(raw, index);
					slot.lastValue = coerceNumber(val);
					this.render(state);
				} catch (err) {
					streamDeck.logger.warn(
						`wind-display: index apply failed for ${slot.path}`,
						err,
					);
				}
			});
		} catch (err) {
			streamDeck.logger.warn(`wind-display: subscribe failed for ${slot.path}`, err);
		}
	}

	private async rebindIfChanged(
		state: ActionState,
		slot: SlotState,
		newPath: string,
	): Promise<void> {
		if (newPath === slot.path) return;
		this.dropSlot(slot);
		slot.path = newPath;
		slot.lastValue = undefined;
		await this.subscribeSlot(state, slot);
	}

	private dropSlot(slot: SlotState): void {
		if (slot.handle) {
			this.xplane.unsubscribe(slot.handle);
			slot.handle = undefined;
		}
	}

	private render(state: ActionState): void {
		const dataUrl = renderWindDataUrl({
			label: state.label,
			directionDeg: state.dir.lastValue,
			speed: state.speed.lastValue,
			oat: state.oat.lastValue,
			speedUnit: state.speedUnit,
			arrowConvention: state.convention,
		});
		state.action
			.setImage(dataUrl)
			.catch((err) => streamDeck.logger.warn("wind-display: setImage failed", err));
	}

	private onXPlaneOffline(): void {
		for (const state of this.states.values()) {
			this.dropSlot(state.dir);
			this.dropSlot(state.speed);
			this.dropSlot(state.oat);
			state.dir.lastValue = undefined;
			state.speed.lastValue = undefined;
			state.oat.lastValue = undefined;
			setOffline(state.action).catch((err) =>
				streamDeck.logger.warn("wind-display: setOffline failed", err),
			);
		}
	}

	private onXPlaneOnline(): void {
		for (const state of this.states.values()) {
			clearOffline(state.action)
				.then(async () => {
					await this.subscribeAll(state);
					this.render(state);
				})
				.catch((err) => streamDeck.logger.warn("wind-display: re-subscribe failed", err));
		}
	}
}

interface ParsedSettings {
	label: string;
	directionPath: string;
	speedPath: string;
	oatPath: string;
	speedUnit: string;
	convention: ArrowConvention;
}

function parseSettings(s: WindDisplaySettings): ParsedSettings {
	const label = s.label?.trim();
	const speedUnit = s.speedUnit?.trim();
	return {
		label: label && label.length > 0 ? label : "WIND",
		directionPath: s.directionDataRef?.trim() ?? "",
		speedPath: s.speedDataRef?.trim() ?? "",
		oatPath: s.oatDataRef?.trim() ?? "",
		speedUnit: speedUnit && speedUnit.length > 0 ? speedUnit : "kt",
		convention: s.arrowConvention === "from" ? "from" : "to",
	};
}
