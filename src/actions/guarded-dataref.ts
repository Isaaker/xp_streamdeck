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

import { TIMINGS, TOLERANCE_FLOAT } from "../const";
import { coerceNumber, toFiniteNumber } from "../util/coerce";
import { applyIndex, parseDataRefPath } from "../util/dataref-path";
import { clearTile, setNotFound, setOffline } from "../util/error-tile";
import { persistImage } from "../util/image-cache";
import { trimString } from "../util/settings";
import type { DataRefValue, SubscriptionHandle, XPlaneClient } from "../xplane";

type GuardedDataRefSettings = JsonObject & {
	shortDataRef?: string;
	shortValueOff?: string | number;
	shortValueOn?: string | number;
	hideShortConfirmation?: boolean;

	longDataRef?: string;
	longValueOff?: string | number;
	longValueOn?: string | number;

	guardDataRef?: string;
	valueLocked?: string | number;
	valueUnlocked?: string | number;
	strictOnMatch?: boolean;
	imageLocked?: string;
	imageUnlocked?: string;
};

const STATE_LOCKED = 0;
const STATE_UNLOCKED = 1;
const STATE_DIRTY = -1;

const DEFAULT_IMAGE_LOCKED = "imgs/guarded/locked";
const DEFAULT_IMAGE_UNLOCKED = "imgs/guarded/unlocked";

interface ParsedSettings {
	shortPath: string;
	shortValueOff: number;
	shortValueOn: number;
	hideShortConfirmation: boolean;

	longPath: string;
	longValueOff: number;
	longValueOn: number;

	guardPath: string;
	valueLocked: number;
	valueUnlocked: number;
	strictOnMatch: boolean;
	imageLocked?: string;
	imageUnlocked?: string;
}

interface ActionState {
	action: KeyAction<GuardedDataRefSettings>;
	longPressTimer?: NodeJS.Timeout;
	longPressFired: boolean;

	guardPath: string;
	valueLocked: number;
	valueUnlocked: number;
	strictOnMatch: boolean;
	imageLocked?: string;
	imageUnlocked?: string;
	imageLockedRaw?: string;
	imageUnlockedRaw?: string;
	handle?: SubscriptionHandle;
	lastValue?: DataRefValue;
	currentState: number;
	renderPromise?: Promise<void>;
}

@action({ UUID: "com.robertw.xplane.guarded-dataref" })
export class XPlaneGuardedDataRef extends SingletonAction<GuardedDataRefSettings> {
	private readonly states = new Map<string, ActionState>();

	constructor(private readonly xplane: XPlaneClient) {
		super();
		this.xplane.on("offline", () => this.onXPlaneOffline());
		this.xplane.on("online", () => this.onXPlaneOnline());
	}

	override async onWillAppear(ev: WillAppearEvent<GuardedDataRefSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const parsed = parseSettings(ev.payload.settings ?? {});
		const state: ActionState = {
			action: ev.action,
			longPressFired: false,
			guardPath: parsed.guardPath,
			valueLocked: parsed.valueLocked,
			valueUnlocked: parsed.valueUnlocked,
			strictOnMatch: parsed.strictOnMatch,
			currentState: STATE_DIRTY,
		};
		this.states.set(ev.action.id, state);
		await this.syncImages(ev.action.id, state, parsed);

		if (state.guardPath) {
			await this.applySubscription(state);
		} else if (this.xplane.isOffline()) {
			await setOffline(ev.action);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<GuardedDataRefSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		this.cancelLongPressTimer(state);
		this.dropSubscription(state);
		this.states.delete(ev.action.id);
		return Promise.resolve();
	}

	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<GuardedDataRefSettings>,
	): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;

		const parsed = parseSettings(ev.payload.settings ?? {});
		const guardChanged = parsed.guardPath !== state.guardPath;

		state.valueLocked = parsed.valueLocked;
		state.valueUnlocked = parsed.valueUnlocked;
		state.strictOnMatch = parsed.strictOnMatch;
		await this.syncImages(ev.action.id, state, parsed);

		if (guardChanged) {
			this.dropSubscription(state);
			state.guardPath = parsed.guardPath;
			state.lastValue = undefined;
			state.currentState = STATE_DIRTY;
			if (state.guardPath) {
				await this.applySubscription(state);
			} else {
				await clearTile(state.action);
				await state.action.setState(STATE_LOCKED);
				const fallback = state.imageLocked ?? DEFAULT_IMAGE_LOCKED;
				await state.action.setImage(fallback);
				state.currentState = STATE_LOCKED;
			}
			return;
		}

		state.currentState = STATE_DIRTY;
		if (state.lastValue !== undefined) {
			await this.renderState(state, state.lastValue);
		}
	}

	override onKeyDown(ev: KeyDownEvent<GuardedDataRefSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		const parsed = parseSettings(ev.payload.settings ?? {});

		if (!parsed.shortPath && !parsed.longPath) {
			streamDeck.logger.warn("guarded-dataref: both short and long DataRef paths are empty");
			ev.action
				.showAlert()
				.catch((err) => streamDeck.logger.warn("guarded-dataref: showAlert failed", err));
			return Promise.resolve();
		}

		this.cancelLongPressTimer(state);
		state.longPressFired = false;

		state.longPressTimer = setTimeout(() => {
			this.fireLongPress(state, parsed).catch((err) =>
				streamDeck.logger.error("guarded-dataref: long press failed", err),
			);
		}, TIMINGS.LONG_PRESS_THRESHOLD_MS);

		return Promise.resolve();
	}

	override async onKeyUp(ev: KeyUpEvent<GuardedDataRefSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;
		const parsed = parseSettings(ev.payload.settings ?? {});

		this.cancelLongPressTimer(state);

		if (state.longPressFired) return;

		await this.fireShortPress(state, parsed);
	}

	private async fireShortPress(state: ActionState, parsed: ParsedSettings): Promise<void> {
		if (!parsed.shortPath) {
			streamDeck.logger.warn("guarded-dataref: shortDataRef is empty");
			await state.action.showAlert();
			return;
		}

		try {
			const target = await this.toggleDataRef(
				parsed.shortPath,
				parsed.shortValueOff,
				parsed.shortValueOn,
				state,
			);
			streamDeck.logger.info(`guarded-dataref: short toggle ${parsed.shortPath} → ${target}`);
			if (!parsed.hideShortConfirmation) {
				await state.action.showOk();
			}
		} catch (err) {
			streamDeck.logger.error(`guarded-dataref: short failed ${parsed.shortPath}`, err);
			await state.action.showAlert();
		}
	}

	private async fireLongPress(state: ActionState, parsed: ParsedSettings): Promise<void> {
		state.longPressFired = true;

		if (!parsed.longPath) {
			streamDeck.logger.warn("guarded-dataref: longDataRef is empty");
			await state.action.showAlert();
			return;
		}

		try {
			const target = await this.toggleDataRef(
				parsed.longPath,
				parsed.longValueOff,
				parsed.longValueOn,
				state,
			);
			streamDeck.logger.info(`guarded-dataref: long toggle ${parsed.longPath} → ${target}`);
		} catch (err) {
			streamDeck.logger.error(`guarded-dataref: long failed ${parsed.longPath}`, err);
			await state.action.showAlert();
		}
	}

	// Read current value of `path`, decide whether it is currently "on", and
	// write the opposite. If `path` is the same as the subscribed guardPath,
	// optimistically update lastValue/render to skip the WS round-trip.
	private async toggleDataRef(
		path: string,
		valueOff: number,
		valueOn: number,
		state: ActionState,
	): Promise<number> {
		const { basePath, index } = parseDataRefPath(path);
		const drId = await this.xplane.getDataRefId(basePath);
		const current =
			path === state.guardPath && state.lastValue !== undefined
				? state.lastValue
				: applyIndex(await this.xplane.readDataRef(drId), index);
		const isOn = mapValueToStateIndex(current, valueOff, valueOn, false) === STATE_UNLOCKED;
		const target = isOn ? valueOff : valueOn;
		await this.xplane.writeDataRef(drId, target, index);
		if (path === state.guardPath) {
			state.lastValue = target;
			await this.renderState(state, target);
		}
		return target;
	}

	private cancelLongPressTimer(state: ActionState): void {
		if (state.longPressTimer) {
			clearTimeout(state.longPressTimer);
			state.longPressTimer = undefined;
		}
	}

	private async syncImages(
		actionId: string,
		state: ActionState,
		parsed: ParsedSettings,
	): Promise<void> {
		if (parsed.imageLocked !== state.imageLockedRaw) {
			state.imageLockedRaw = parsed.imageLocked;
			try {
				state.imageLocked = await persistImage(actionId, "locked", parsed.imageLocked);
			} catch (err) {
				streamDeck.logger.warn("guarded-dataref: persistImage locked failed", err);
				state.imageLocked = parsed.imageLocked;
			}
		}
		if (parsed.imageUnlocked !== state.imageUnlockedRaw) {
			state.imageUnlockedRaw = parsed.imageUnlocked;
			try {
				state.imageUnlocked = await persistImage(
					actionId,
					"unlocked",
					parsed.imageUnlocked,
				);
			} catch (err) {
				streamDeck.logger.warn("guarded-dataref: persistImage unlocked failed", err);
				state.imageUnlocked = parsed.imageUnlocked;
			}
		}
	}

	private async applySubscription(state: ActionState): Promise<void> {
		if (!state.guardPath) return;

		if (this.xplane.isOffline()) {
			await setOffline(state.action);
			return;
		}

		const { basePath, index } = parseDataRefPath(state.guardPath);

		try {
			state.handle = await this.xplane.subscribe(basePath, (raw) => {
				let value: DataRefValue;
				try {
					value = applyIndex(raw, index);
				} catch (err) {
					streamDeck.logger.warn(
						`guarded-dataref: index apply failed for ${state.guardPath}`,
						err,
					);
					setNotFound(state.action).catch((e) =>
						streamDeck.logger.warn("guarded-dataref: setNotFound failed", e),
					);
					return;
				}
				state.lastValue = value;
				this.renderState(state, value).catch((err) =>
					streamDeck.logger.warn("guarded-dataref: render failed", err),
				);
			});

			try {
				const id = await this.xplane.getDataRefId(basePath);
				const initial = applyIndex(await this.xplane.readDataRef(id), index);
				if (state.lastValue === undefined) {
					state.lastValue = initial;
					await this.renderState(state, initial);
				}
			} catch (err) {
				streamDeck.logger.warn(
					`guarded-dataref: initial read failed for ${state.guardPath}`,
					err,
				);
			}
		} catch (err) {
			streamDeck.logger.warn(`guarded-dataref: subscribe failed for ${state.guardPath}`, err);
			await setNotFound(state.action);
			await state.action.showAlert();
		}
	}

	private dropSubscription(state: ActionState): void {
		if (state.handle) {
			this.xplane.unsubscribe(state.handle);
			state.handle = undefined;
		}
	}

	private renderState(state: ActionState, value: DataRefValue): Promise<void> {
		const target = mapValueToStateIndex(
			value,
			state.valueLocked,
			state.valueUnlocked,
			state.strictOnMatch,
		);
		const previous = state.renderPromise ?? Promise.resolve();
		const next = previous
			.catch(() => {
				/* prior render error already logged; don't propagate */
			})
			.then(async () => {
				if (target === state.currentState) return;
				streamDeck.logger.info(
					`guarded-dataref: setState ${target} for ${state.guardPath}`,
				);
				await clearTile(state.action);
				await state.action.setState(target);
				const customImage =
					target === STATE_UNLOCKED ? state.imageUnlocked : state.imageLocked;
				const image =
					customImage ??
					(target === STATE_UNLOCKED ? DEFAULT_IMAGE_UNLOCKED : DEFAULT_IMAGE_LOCKED);
				await state.action.setImage(image);
				state.currentState = target;
			});
		state.renderPromise = next;
		return next;
	}

	private onXPlaneOffline(): void {
		for (const state of this.states.values()) {
			this.cancelLongPressTimer(state);
			if (state.guardPath) {
				this.dropSubscription(state);
				state.currentState = STATE_DIRTY;
			}
			setOffline(state.action).catch((err) =>
				streamDeck.logger.warn("guarded-dataref: setOffline failed", err),
			);
		}
	}

	private onXPlaneOnline(): void {
		for (const state of this.states.values()) {
			if (state.guardPath && !state.handle) {
				this.applySubscription(state).catch((err) =>
					streamDeck.logger.warn(
						`guarded-dataref: re-subscribe failed for ${state.guardPath}`,
						err,
					),
				);
			}
		}
	}
}

function parseSettings(s: GuardedDataRefSettings): ParsedSettings {
	const shortPath = trimString(s.shortDataRef);
	const longPath = trimString(s.longDataRef);
	const guardPathRaw = trimString(s.guardDataRef);
	const guardPath = guardPathRaw || shortPath;

	const shortValueOff = toFiniteNumber(s.shortValueOff) ?? 0;
	const shortValueOn = toFiniteNumber(s.shortValueOn) ?? 1;
	const longValueOff = toFiniteNumber(s.longValueOff) ?? 0;
	const longValueOn = toFiniteNumber(s.longValueOn) ?? 1;

	// Guard locked/unlocked default to short's off/on so a single-DataRef setup
	// (guard = short, empty guardDataRef field) needs no extra wiring.
	const valueLocked = toFiniteNumber(s.valueLocked) ?? shortValueOff;
	const valueUnlocked = toFiniteNumber(s.valueUnlocked) ?? shortValueOn;

	const imageLocked =
		typeof s.imageLocked === "string" && s.imageLocked.length > 0 ? s.imageLocked : undefined;
	const imageUnlocked =
		typeof s.imageUnlocked === "string" && s.imageUnlocked.length > 0
			? s.imageUnlocked
			: undefined;

	return {
		shortPath,
		shortValueOff,
		shortValueOn,
		hideShortConfirmation: s.hideShortConfirmation === true,
		longPath,
		longValueOff,
		longValueOn,
		guardPath,
		valueLocked,
		valueUnlocked,
		strictOnMatch: s.strictOnMatch === true,
		imageLocked,
		imageUnlocked,
	};
}

function mapValueToStateIndex(
	value: DataRefValue,
	valueLocked: number,
	valueUnlocked: number,
	strictOnMatch: boolean,
): typeof STATE_LOCKED | typeof STATE_UNLOCKED {
	const num = coerceNumber(value);
	if (num === undefined) return STATE_LOCKED;
	if (strictOnMatch) {
		return Math.abs(num - valueUnlocked) < TOLERANCE_FLOAT ? STATE_UNLOCKED : STATE_LOCKED;
	}
	if (valueLocked === 0 && valueUnlocked === 1) {
		return num >= 0.5 ? STATE_UNLOCKED : STATE_LOCKED;
	}
	const dLocked = Math.abs(num - valueLocked);
	const dUnlocked = Math.abs(num - valueUnlocked);
	return dUnlocked < dLocked ? STATE_UNLOCKED : STATE_LOCKED;
}
