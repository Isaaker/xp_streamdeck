import streamDeck, {
	action,
	type DidReceiveSettingsEvent,
	type KeyAction,
	type KeyDownEvent,
	type KeyUpEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { TIMINGS } from "../const";
import { selectors } from "../selectors/registry";
import { toFiniteNumber } from "../util/coerce";
import { renderSelectorSvg, svgToDataUrl } from "../util/selector-image";
import { trimString } from "../util/settings";

type DisplaySelectorSettings = JsonObject & {
	key?: string;
	count?: string | number;
	label?: string;
};

interface ParsedSettings {
	key: string;
	count: number;
	label: string;
}

interface ActionState {
	action: KeyAction<DisplaySelectorSettings>;
	key: string;
	count: number;
	label: string;
	longPressTimer?: NodeJS.Timeout;
	longPressFired: boolean;
	watchHandle?: () => void;
}

const DEFAULT_COUNT = 4;

@action({ UUID: "com.robertw.xplane.display-selector" })
export class XPlaneDisplaySelector extends SingletonAction<DisplaySelectorSettings> {
	private readonly states = new Map<string, ActionState>();

	override async onWillAppear(ev: WillAppearEvent<DisplaySelectorSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const parsed = parseSettings(ev.payload.settings ?? {});
		const state: ActionState = {
			action: ev.action,
			key: parsed.key,
			count: parsed.count,
			label: parsed.label,
			longPressFired: false,
		};
		state.watchHandle = selectors.watch((changed) => {
			if (state.key && changed.has(state.key)) {
				this.render(state).catch((err) =>
					streamDeck.logger.warn("display-selector: render failed", err),
				);
			}
		});
		this.states.set(ev.action.id, state);
		// Seed default if the selector isn't set yet, so dependent buttons resolve to 1.
		if (state.key && selectors.get(state.key) === undefined) {
			await selectors.set(state.key, 1);
		}
		await this.render(state);
	}

	override onWillDisappear(ev: WillDisappearEvent<DisplaySelectorSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		this.cancelLongPressTimer(state);
		state.watchHandle?.();
		this.states.delete(ev.action.id);
		return Promise.resolve();
	}

	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<DisplaySelectorSettings>,
	): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;
		const parsed = parseSettings(ev.payload.settings ?? {});
		state.key = parsed.key;
		state.count = parsed.count;
		state.label = parsed.label;
		if (state.key && selectors.get(state.key) === undefined) {
			await selectors.set(state.key, 1);
		}
		await this.render(state);
	}

	override onKeyDown(ev: KeyDownEvent<DisplaySelectorSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();

		if (!state.key) {
			streamDeck.logger.warn("display-selector: key is empty");
			ev.action
				.showAlert()
				.catch((err) => streamDeck.logger.warn("display-selector: showAlert failed", err));
			return Promise.resolve();
		}

		this.cancelLongPressTimer(state);
		state.longPressFired = false;

		state.longPressTimer = setTimeout(() => {
			this.step(state, -1).catch((err) =>
				streamDeck.logger.error("display-selector: long step failed", err),
			);
		}, TIMINGS.LONG_PRESS_THRESHOLD_MS);

		return Promise.resolve();
	}

	override async onKeyUp(ev: KeyUpEvent<DisplaySelectorSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;
		this.cancelLongPressTimer(state);
		if (state.longPressFired) return;
		if (!state.key) return;
		await this.step(state, +1);
	}

	private async step(state: ActionState, direction: 1 | -1): Promise<void> {
		if (direction === -1) state.longPressFired = true;
		const current = selectors.get(state.key) ?? 1;
		const clamped = Math.max(1, Math.min(state.count, Math.round(current)));
		// Wrap-around: forward N→1, backward 1→N.
		const next =
			direction === 1
				? clamped >= state.count
					? 1
					: clamped + 1
				: clamped <= 1
					? state.count
					: clamped - 1;
		streamDeck.logger.info(
			`display-selector: ${state.key} ${clamped} → ${next} (${direction > 0 ? "short" : "long"})`,
		);
		await selectors.set(state.key, next);
		await this.render(state);
	}

	private cancelLongPressTimer(state: ActionState): void {
		if (state.longPressTimer) {
			clearTimeout(state.longPressTimer);
			state.longPressTimer = undefined;
		}
	}

	private async render(state: ActionState): Promise<void> {
		const value = state.key ? (selectors.get(state.key) ?? 1) : 1;
		const clamped = Math.max(1, Math.min(state.count, Math.round(value)));
		const svg = renderSelectorSvg({
			value: clamped,
			count: state.count,
			label: state.label || undefined,
		});
		await state.action.setImage(svgToDataUrl(svg));
		// Clear any leftover title overlay from an earlier setTitle() build so
		// the rendered image owns the tile.
		await state.action.setTitle("");
	}
}

function parseSettings(s: DisplaySelectorSettings): ParsedSettings {
	const key = trimString(s.key);
	const countRaw = toFiniteNumber(s.count) ?? DEFAULT_COUNT;
	const count = Math.max(1, Math.round(countRaw));
	const label = trimString(s.label);
	return { key, count, label };
}
