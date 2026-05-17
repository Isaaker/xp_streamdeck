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

import { applyIndex, parseDataRefPath } from "../util/dataref-path";
import { clearTile, setNotFound, setOffline } from "../util/error-tile";
import { persistImage } from "../util/image-cache";
import type { DataRefValue, SubscriptionHandle, XPlaneClient } from "../xplane";

type LongPressMode = "activate" | "hold" | "autoRepeat";

type GuardedCommandSettings = JsonObject & {
	shortPressCommand?: string;
	hideShortConfirmation?: boolean;

	longPressCommand?: string;
	longPressMode?: LongPressMode;

	guardDataRef?: string;
	valueLocked?: string | number;
	valueUnlocked?: string | number;
	imageLocked?: string;
	imageUnlocked?: string;
	strictOnMatch?: boolean;
};

const STATE_LOCKED = 0;
const STATE_UNLOCKED = 1;

const UNINITIALIZED_STATE = -1;

const LONG_PRESS_THRESHOLD_MS = 500;
const REPEAT_INTERVAL_MS = 200;

const DEFAULT_IMAGE_LOCKED = "imgs/states/off";
const DEFAULT_IMAGE_UNLOCKED = "imgs/states/on";

interface ParsedSettings {
	shortPath: string;
	longPath: string;
	longMode: LongPressMode;
	guardPath: string;
	valueLocked: number;
	valueUnlocked: number;
	imageLocked?: string;
	imageUnlocked?: string;
	strictOnMatch: boolean;
	hideShortConfirmation: boolean;
}

interface ActionState {
	action: KeyAction<GuardedCommandSettings>;
	longPressTimer?: NodeJS.Timeout;
	longPressFired: boolean;
	longPressActiveCommandId?: number;
	longPressActiveMode?: LongPressMode;
	repeatInterval?: NodeJS.Timeout;

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

@action({ UUID: "com.robertw.xplane.guarded-command" })
export class XPlaneGuardedCommand extends SingletonAction<GuardedCommandSettings> {
	private readonly states = new Map<string, ActionState>();

	constructor(private readonly xplane: XPlaneClient) {
		super();
		this.xplane.on("offline", () => this.onXPlaneOffline());
		this.xplane.on("online", () => this.onXPlaneOnline());
	}

	override async onWillAppear(ev: WillAppearEvent<GuardedCommandSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const parsed = parseSettings(ev.payload.settings ?? {});
		const state: ActionState = {
			action: ev.action,
			longPressFired: false,
			guardPath: parsed.guardPath,
			valueLocked: parsed.valueLocked,
			valueUnlocked: parsed.valueUnlocked,
			strictOnMatch: parsed.strictOnMatch,
			currentState: UNINITIALIZED_STATE,
		};
		this.states.set(ev.action.id, state);
		await this.syncImages(ev.action.id, state, parsed);

		if (state.guardPath) {
			await this.applySubscription(state);
		} else if (this.xplane.isOffline()) {
			await setOffline(ev.action);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<GuardedCommandSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		this.cancelLongPressTimer(state);
		this.stopRepeater(state);
		this.dropSubscription(state);
		this.states.delete(ev.action.id);
		return Promise.resolve();
	}

	override async onDidReceiveSettings(
		ev: DidReceiveSettingsEvent<GuardedCommandSettings>,
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
			state.currentState = UNINITIALIZED_STATE;
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

		// Force a re-render so changed thresholds and image overrides take effect.
		state.currentState = UNINITIALIZED_STATE;
		if (state.lastValue !== undefined) {
			await this.renderState(state, state.lastValue);
		}
	}

	override onKeyDown(ev: KeyDownEvent<GuardedCommandSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		const parsed = parseSettings(ev.payload.settings ?? {});

		if (!parsed.shortPath && !parsed.longPath) {
			streamDeck.logger.warn("guarded-command: both short and long command paths are empty");
			ev.action
				.showAlert()
				.catch((err) => streamDeck.logger.warn("guarded-command: showAlert failed", err));
			return Promise.resolve();
		}

		this.cancelLongPressTimer(state);
		this.stopRepeater(state);
		state.longPressFired = false;
		state.longPressActiveCommandId = undefined;
		state.longPressActiveMode = undefined;

		state.longPressTimer = setTimeout(() => {
			this.fireLongPress(state, parsed).catch((err) =>
				streamDeck.logger.error("guarded-command: long press failed", err),
			);
		}, LONG_PRESS_THRESHOLD_MS);

		return Promise.resolve();
	}

	override async onKeyUp(ev: KeyUpEvent<GuardedCommandSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;
		const parsed = parseSettings(ev.payload.settings ?? {});

		this.cancelLongPressTimer(state);

		if (state.longPressFired) {
			await this.endLongPress(state);
			return;
		}

		await this.fireShortPress(state, parsed);
	}

	private async fireShortPress(state: ActionState, parsed: ParsedSettings): Promise<void> {
		if (!parsed.shortPath) {
			streamDeck.logger.warn("guarded-command: shortPressCommand is empty");
			await state.action.showAlert();
			return;
		}

		try {
			const id = await this.xplane.getCommandId(parsed.shortPath);
			await this.xplane.activateCommand(id);
			streamDeck.logger.info(
				`guarded-command: short activate ${parsed.shortPath} (id=${id})`,
			);
			if (!parsed.hideShortConfirmation) {
				await state.action.showOk();
			}
		} catch (err) {
			streamDeck.logger.error(`guarded-command: short failed ${parsed.shortPath}`, err);
			await state.action.showAlert();
		}
	}

	private async fireLongPress(state: ActionState, parsed: ParsedSettings): Promise<void> {
		state.longPressFired = true;

		if (!parsed.longPath) {
			streamDeck.logger.warn("guarded-command: longPressCommand is empty");
			await state.action.showAlert();
			return;
		}

		try {
			const id = await this.xplane.getCommandId(parsed.longPath);
			state.longPressActiveCommandId = id;
			state.longPressActiveMode = parsed.longMode;

			if (parsed.longMode === "hold") {
				await this.xplane.beginCommand(id);
				streamDeck.logger.info(`guarded-command: long begin ${parsed.longPath} (id=${id})`);
			} else if (parsed.longMode === "autoRepeat") {
				await this.xplane.activateCommand(id);
				streamDeck.logger.info(
					`guarded-command: long auto-repeat start ${parsed.longPath} (id=${id})`,
				);
				state.repeatInterval = setInterval(() => {
					this.xplane
						.activateCommand(id)
						.catch((err) =>
							streamDeck.logger.error(
								`guarded-command: repeat failed ${parsed.longPath}`,
								err,
							),
						);
				}, REPEAT_INTERVAL_MS);
			} else {
				await this.xplane.activateCommand(id);
				streamDeck.logger.info(
					`guarded-command: long activate ${parsed.longPath} (id=${id})`,
				);
			}
		} catch (err) {
			streamDeck.logger.error(`guarded-command: long failed ${parsed.longPath}`, err);
			state.longPressActiveCommandId = undefined;
			state.longPressActiveMode = undefined;
			await state.action.showAlert();
		}
	}

	private async endLongPress(state: ActionState): Promise<void> {
		const id = state.longPressActiveCommandId;
		const mode = state.longPressActiveMode;
		state.longPressActiveCommandId = undefined;
		state.longPressActiveMode = undefined;

		this.stopRepeater(state);

		if (id === undefined || mode !== "hold") return;

		try {
			await this.xplane.endCommand(id);
			streamDeck.logger.info(`guarded-command: long end (id=${id})`);
		} catch (err) {
			streamDeck.logger.error("guarded-command: long end failed", err);
			await state.action.showAlert();
		}
	}

	private cancelLongPressTimer(state: ActionState): void {
		if (state.longPressTimer) {
			clearTimeout(state.longPressTimer);
			state.longPressTimer = undefined;
		}
	}

	private stopRepeater(state: ActionState): void {
		if (state.repeatInterval) {
			clearInterval(state.repeatInterval);
			state.repeatInterval = undefined;
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
				streamDeck.logger.warn("guarded-command: persistImage locked failed", err);
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
				streamDeck.logger.warn("guarded-command: persistImage unlocked failed", err);
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
						`guarded-command: index apply failed for ${state.guardPath}`,
						err,
					);
					setNotFound(state.action).catch((e) =>
						streamDeck.logger.warn("guarded-command: setNotFound failed", e),
					);
					return;
				}
				state.lastValue = value;
				this.renderState(state, value).catch((err) =>
					streamDeck.logger.warn("guarded-command: render failed", err),
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
					`guarded-command: initial read failed for ${state.guardPath}`,
					err,
				);
			}
		} catch (err) {
			streamDeck.logger.warn(`guarded-command: subscribe failed for ${state.guardPath}`, err);
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
					`guarded-command: setState ${target} for ${state.guardPath}`,
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
			this.stopRepeater(state);
			if (state.guardPath) {
				this.dropSubscription(state);
				state.currentState = UNINITIALIZED_STATE;
			}
			setOffline(state.action).catch((err) =>
				streamDeck.logger.warn("guarded-command: setOffline failed", err),
			);
		}
	}

	private onXPlaneOnline(): void {
		for (const state of this.states.values()) {
			if (state.guardPath && !state.handle) {
				this.applySubscription(state).catch((err) =>
					streamDeck.logger.warn(
						`guarded-command: re-subscribe failed for ${state.guardPath}`,
						err,
					),
				);
			}
		}
	}
}

function parseSettings(s: GuardedCommandSettings): ParsedSettings {
	const shortPath = s.shortPressCommand?.trim() ?? "";
	const longPath = s.longPressCommand?.trim() ?? "";
	const longMode: LongPressMode =
		s.longPressMode === "activate"
			? "activate"
			: s.longPressMode === "autoRepeat"
				? "autoRepeat"
				: "hold";
	const guardPath = s.guardDataRef?.trim() ?? "";
	const valueLocked = toFiniteNumber(s.valueLocked) ?? 0;
	const valueUnlocked = toFiniteNumber(s.valueUnlocked) ?? 1;
	const imageLocked =
		typeof s.imageLocked === "string" && s.imageLocked.length > 0 ? s.imageLocked : undefined;
	const imageUnlocked =
		typeof s.imageUnlocked === "string" && s.imageUnlocked.length > 0
			? s.imageUnlocked
			: undefined;
	const strictOnMatch = s.strictOnMatch === true;
	const hideShortConfirmation = s.hideShortConfirmation === true;
	return {
		shortPath,
		longPath,
		longMode,
		guardPath,
		valueLocked,
		valueUnlocked,
		imageLocked,
		imageUnlocked,
		strictOnMatch,
		hideShortConfirmation,
	};
}

function toFiniteNumber(v: unknown): number | undefined {
	if (v === undefined || v === null || v === "") return undefined;
	const n = typeof v === "number" ? v : Number(v);
	return Number.isFinite(n) ? n : undefined;
}

function coerceNumber(v: DataRefValue): number | undefined {
	if (typeof v === "number") return v;
	if (typeof v === "boolean") return v ? 1 : 0;
	if (typeof v === "string") {
		const n = Number(v);
		return Number.isFinite(n) ? n : undefined;
	}
	if (Array.isArray(v) && v.length > 0 && typeof v[0] === "number") return v[0];
	return undefined;
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
		return Math.abs(num - valueUnlocked) < 1e-6 ? STATE_UNLOCKED : STATE_LOCKED;
	}
	if (valueLocked === 0 && valueUnlocked === 1) {
		return num >= 0.5 ? STATE_UNLOCKED : STATE_LOCKED;
	}
	const dLocked = Math.abs(num - valueLocked);
	const dUnlocked = Math.abs(num - valueUnlocked);
	return dUnlocked < dLocked ? STATE_UNLOCKED : STATE_LOCKED;
}
