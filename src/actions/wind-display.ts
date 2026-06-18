/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { selectors } from "../selectors/registry";
import { coerceNumber } from "../util/coerce";
import { applyIndex, parseDataRefPath } from "../util/dataref-path";
import { clearOffline, setOffline } from "../util/error-tile";
import { extractPlaceholderKeys, substitutePlaceholders } from "../util/placeholders";
import { trimString, trimStringOr } from "../util/settings";
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
		selectors.watch((changed) => this.onSelectorsChanged(changed));
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
		const resolved = substitutePlaceholders(slot.path, selectors.snapshot());
		const { basePath, index } = parseDataRefPath(resolved);
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

	private onSelectorsChanged(changed: ReadonlySet<string>): void {
		for (const state of this.states.values()) {
			const slots = [state.dir, state.speed, state.oat].filter((slot) => {
				if (!slot.path) return false;
				return extractPlaceholderKeys(slot.path).some((k) => changed.has(k));
			});
			if (slots.length === 0) continue;
			for (const slot of slots) {
				this.dropSlot(slot);
				slot.lastValue = undefined;
			}
			Promise.all(slots.map((slot) => this.subscribeSlot(state, slot)))
				.then(() => this.render(state))
				.catch((err) =>
					streamDeck.logger.warn("wind-display: selector re-subscribe failed", err),
				);
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
	return {
		label: trimStringOr(s.label, "WIND"),
		directionPath: trimString(s.directionDataRef),
		speedPath: trimString(s.speedDataRef),
		oatPath: trimString(s.oatDataRef),
		speedUnit: trimStringOr(s.speedUnit, "kt"),
		convention: s.arrowConvention === "from" ? "from" : "to",
	};
}
