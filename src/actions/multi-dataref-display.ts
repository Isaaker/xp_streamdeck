import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { applyIndex, parseDataRefPath } from "../util/dataref-path";
import { clearOffline, NOT_FOUND_SUFFIX, setOffline } from "../util/error-tile";
import { formatDataRefValue } from "../util/format";
import type { DataRefValue, SubscriptionHandle, XPlaneClient } from "../xplane";

const SLOT_COUNT = 3;
const PENDING_PLACEHOLDER = "…";

type MultiDataRefDisplaySettings = JsonObject & {
	title?: string;
	slot1Label?: string;
	slot1DataRef?: string;
	slot1Format?: string;
	slot1UnitScale?: string | number;
	slot1Precision?: string | number;
	slot2Label?: string;
	slot2DataRef?: string;
	slot2Format?: string;
	slot2UnitScale?: string | number;
	slot2Precision?: string | number;
	slot3Label?: string;
	slot3DataRef?: string;
	slot3Format?: string;
	slot3UnitScale?: string | number;
	slot3Precision?: string | number;
};

interface SlotState {
	path: string;
	label: string;
	format: string;
	unitScale?: number;
	precision?: number;
	handle?: SubscriptionHandle;
	lastValue?: DataRefValue;
	notFound: boolean;
}

interface ActionState {
	action: WillAppearEvent<MultiDataRefDisplaySettings>["action"];
	title: string;
	slots: SlotState[];
}

@action({ UUID: "com.robertw.xplane.multi-dataref-display" })
export class XPlaneMultiDataRefDisplay extends SingletonAction<MultiDataRefDisplaySettings> {
	private readonly states = new Map<string, ActionState>();

	constructor(private readonly xplane: XPlaneClient) {
		super();
		this.xplane.on("offline", () => this.onXPlaneOffline());
		this.xplane.on("online", () => this.onXPlaneOnline());
	}

	override async onWillAppear(ev: WillAppearEvent<MultiDataRefDisplaySettings>): Promise<void> {
		const parsed = parseSettings(ev.payload.settings ?? {});
		const state: ActionState = {
			action: ev.action,
			title: parsed.title,
			slots: parsed.slots.map((s) => ({ ...s, notFound: false })),
		};
		this.states.set(ev.action.id, state);

		if (this.xplane.isOffline()) {
			await setOffline(ev.action);
			return;
		}
		await Promise.all(state.slots.map((slot) => this.applySlotSubscription(state, slot)));
		this.render(state);
	}

	override onWillDisappear(ev: WillDisappearEvent<MultiDataRefDisplaySettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		for (const slot of state.slots) {
			this.dropSlotSubscription(slot);
		}
		this.states.delete(ev.action.id);
		return Promise.resolve();
	}

	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<MultiDataRefDisplaySettings>,
	): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;

		const parsed = parseSettings(ev.payload.settings ?? {});
		state.title = parsed.title;

		for (let i = 0; i < SLOT_COUNT; i++) {
			const next = parsed.slots[i];
			const slot = state.slots[i];
			const pathChanged = next.path !== slot.path;
			slot.label = next.label;
			slot.format = next.format;
			slot.unitScale = next.unitScale;
			slot.precision = next.precision;
			if (pathChanged) {
				this.dropSlotSubscription(slot);
				slot.path = next.path;
				slot.lastValue = undefined;
				slot.notFound = false;
				await this.applySlotSubscription(state, slot);
			}
		}
		this.render(state);
	}

	private async applySlotSubscription(state: ActionState, slot: SlotState): Promise<void> {
		if (!slot.path) return;
		if (this.xplane.isOffline()) return;

		const { basePath, index } = parseDataRefPath(slot.path);
		try {
			slot.handle = await this.xplane.subscribe(basePath, (raw) => {
				try {
					slot.lastValue = applyIndex(raw, index);
					slot.notFound = false;
					this.render(state);
				} catch (err) {
					streamDeck.logger.warn(
						`multi-dataref-display: index apply failed for ${slot.path}`,
						err,
					);
					slot.notFound = true;
					this.render(state);
				}
			});
		} catch (err) {
			streamDeck.logger.warn(`multi-dataref-display: subscribe failed for ${slot.path}`, err);
			slot.notFound = true;
			this.render(state);
		}
	}

	private dropSlotSubscription(slot: SlotState): void {
		if (slot.handle) {
			this.xplane.unsubscribe(slot.handle);
			slot.handle = undefined;
		}
	}

	private render(state: ActionState): void {
		const lines: string[] = [];
		if (state.title) lines.push(state.title);
		for (const slot of state.slots) {
			if (!slot.path) continue;
			const value = slot.notFound
				? NOT_FOUND_SUFFIX
				: slot.lastValue === undefined
					? PENDING_PLACEHOLDER
					: formatDataRefValue(slot.lastValue, {
							format: slot.format,
							unitScale: slot.unitScale,
							precision: slot.precision,
						});
			lines.push(slot.label ? `${slot.label} ${value}` : value);
		}
		state.action
			.setTitle(lines.join("\n"))
			.catch((err) => streamDeck.logger.warn("multi-dataref-display: setTitle failed", err));
	}

	private onXPlaneOffline(): void {
		for (const state of this.states.values()) {
			for (const slot of state.slots) {
				this.dropSlotSubscription(slot);
				slot.lastValue = undefined;
			}
			setOffline(state.action).catch((err) =>
				streamDeck.logger.warn("multi-dataref-display: setOffline failed", err),
			);
		}
	}

	private onXPlaneOnline(): void {
		for (const state of this.states.values()) {
			clearOffline(state.action)
				.then(async () => {
					await Promise.all(
						state.slots.map((slot) => this.applySlotSubscription(state, slot)),
					);
					this.render(state);
				})
				.catch((err) =>
					streamDeck.logger.warn("multi-dataref-display: re-subscribe failed", err),
				);
		}
	}
}

interface ParsedSlot {
	path: string;
	label: string;
	format: string;
	unitScale?: number;
	precision?: number;
}

interface ParsedSettings {
	title: string;
	slots: ParsedSlot[];
}

function parseSettings(s: MultiDataRefDisplaySettings): ParsedSettings {
	return {
		title: s.title?.trim() ?? "",
		slots: [
			parseSlot(
				s.slot1Label,
				s.slot1DataRef,
				s.slot1Format,
				s.slot1UnitScale,
				s.slot1Precision,
			),
			parseSlot(
				s.slot2Label,
				s.slot2DataRef,
				s.slot2Format,
				s.slot2UnitScale,
				s.slot2Precision,
			),
			parseSlot(
				s.slot3Label,
				s.slot3DataRef,
				s.slot3Format,
				s.slot3UnitScale,
				s.slot3Precision,
			),
		],
	};
}

function parseSlot(
	label: string | undefined,
	path: string | undefined,
	format: string | undefined,
	unitScale: string | number | undefined,
	precision: string | number | undefined,
): ParsedSlot {
	const trimmedPath = path?.trim() ?? "";
	const trimmedLabel = label?.trim() ?? "";
	const formatRaw = format?.trim();
	return {
		path: trimmedPath,
		label: trimmedLabel,
		format: formatRaw && formatRaw.length > 0 ? formatRaw : "%s",
		unitScale: toFiniteNumber(unitScale),
		precision: toFiniteNumber(precision),
	};
}

function toFiniteNumber(v: unknown): number | undefined {
	if (v === undefined || v === null || v === "") return undefined;
	const n = typeof v === "number" ? v : Number(v);
	return Number.isFinite(n) ? n : undefined;
}
