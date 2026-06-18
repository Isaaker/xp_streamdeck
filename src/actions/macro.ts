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
	type KeyAction,
	type KeyDownEvent,
	type KeyUpEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { TOLERANCE_FLOAT } from "../const";
import { selectors } from "../selectors/registry";
import { coerceNumber, describeValue, toFiniteNumber } from "../util/coerce";
import { applyIndex, parseDataRefPath } from "../util/dataref-path";
import { clearOffline, clearTile, setNotFound, setOffline } from "../util/error-tile";
import { parseMacro } from "../util/macro-dsl";
import { runMacro } from "../util/macro-runner";
import { extractPlaceholderKeys, substitutePlaceholders } from "../util/placeholders";
import { trimString } from "../util/settings";
import type { DataRefValue, SubscriptionHandle, XPlaneClient } from "../xplane";

type MacroSettings = JsonObject & {
	label?: string;
	// Step lists in the line-based DSL (see util/macro-dsl.ts).
	pressSteps?: string;
	releaseSteps?: string;
	toggleMode?: boolean;
	onSteps?: string;
	offSteps?: string;
	// Independent state feedback (icon follows this DataRef).
	stateDataRefPath?: string;
	valueOff?: string | number;
	valueOn?: string | number;
	strictOnMatch?: boolean;
	stopOnError?: boolean;
	hideConfirmation?: boolean;
};

const STATE_OFF = 0;
const STATE_ON = 1;
const STATE_DIRTY = -1;

interface ParsedSettings {
	label: string;
	pressSteps: string;
	releaseSteps: string;
	toggleMode: boolean;
	onSteps: string;
	offSteps: string;
	statePath: string;
	valueOff: number;
	valueOn: number;
	strictOnMatch: boolean;
	stopOnError: boolean;
	hideConfirmation: boolean;
}

interface ActionState {
	action: KeyAction<MacroSettings>;
	label: string;
	// Read source for visual state. Empty when no state DataRef is configured;
	// then toggle direction falls back to `internalOn`.
	statePath: string;
	valueOff: number;
	valueOn: number;
	strictOnMatch: boolean;
	handle?: SubscriptionHandle;
	lastValue?: DataRefValue;
	currentState: number;
	renderPromise?: Promise<void>;
	// Guards against a second keyDown firing while a previous run is in flight.
	inflightKeyDown: boolean;
	// Toggle direction fallback when no state DataRef is configured.
	internalOn: boolean;
	// Cooperative cancellation passed to runMacro (flipped on willDisappear).
	cancel: { cancelled: boolean };
}

@action({ UUID: "com.robertw.xplane.macro" })
export class XPlaneMacro extends SingletonAction<MacroSettings> {
	private readonly states = new Map<string, ActionState>();

	constructor(private readonly xplane: XPlaneClient) {
		super();
		this.xplane.on("offline", () => this.onXPlaneOffline());
		this.xplane.on("online", () => this.onXPlaneOnline());
		selectors.watch((changed) => this.onSelectorsChanged(changed));
	}

	override async onWillAppear(ev: WillAppearEvent<MacroSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const parsed = parseSettings(ev.payload.settings ?? {});
		const state: ActionState = {
			action: ev.action,
			label: parsed.label,
			statePath: parsed.statePath,
			valueOff: parsed.valueOff,
			valueOn: parsed.valueOn,
			strictOnMatch: parsed.strictOnMatch,
			currentState: STATE_DIRTY,
			inflightKeyDown: false,
			internalOn: false,
			cancel: { cancelled: false },
		};
		this.states.set(ev.action.id, state);
		if (state.statePath) {
			await this.applySubscription(state);
		} else if (this.xplane.isOffline()) {
			await setOffline(state.action);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<MacroSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		state.cancel.cancelled = true;
		this.dropSubscription(state);
		this.states.delete(ev.action.id);
		return Promise.resolve();
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<MacroSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;

		const parsed = parseSettings(ev.payload.settings ?? {});
		const statePathChanged = parsed.statePath !== state.statePath;

		state.label = parsed.label;
		state.valueOff = parsed.valueOff;
		state.valueOn = parsed.valueOn;
		state.strictOnMatch = parsed.strictOnMatch;

		if (statePathChanged) {
			this.dropSubscription(state);
			state.statePath = parsed.statePath;
			state.lastValue = undefined;
			state.currentState = STATE_DIRTY;
			if (state.statePath) {
				await this.applySubscription(state);
			} else if (this.xplane.isOffline()) {
				await setOffline(state.action);
			}
			return;
		}

		// Force a re-render so changed off/on thresholds take effect immediately.
		state.currentState = STATE_DIRTY;
		if (state.statePath && state.lastValue !== undefined) {
			await this.renderState(state, state.lastValue);
		}
	}

	override async onKeyDown(ev: KeyDownEvent<MacroSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		const parsed = parseSettings(ev.payload.settings ?? {});
		const snap = selectors.snapshot();

		if (state?.inflightKeyDown) {
			streamDeck.logger.info("macro: ignoring keyDown while previous run is in flight");
			await ev.action.showAlert();
			return;
		}
		if (state) state.inflightKeyDown = true;

		try {
			let text: string;
			let wasOn = false;
			if (parsed.toggleMode) {
				wasOn = await this.resolveToggleDirection(state, parsed, snap);
				text = wasOn ? parsed.offSteps : parsed.onSteps;
			} else {
				text = parsed.pressSteps;
			}

			const { steps, errors } = parseMacro(text);
			if (errors.length > 0) {
				for (const e of errors)
					streamDeck.logger.warn(`macro: line ${e.line}: ${e.reason}`);
				await ev.action.showAlert();
				return;
			}
			if (steps.length === 0) {
				streamDeck.logger.warn("macro: no steps to run on press");
				await ev.action.showAlert();
				return;
			}

			if (state) state.cancel.cancelled = false;
			const result = await runMacro(this.xplane, steps, {
				stopOnError: parsed.stopOnError,
				selectors: snap,
				signal: state?.cancel,
			});

			if (result.failed > 0) {
				await ev.action.showAlert();
				return;
			}

			// Internal toggle: flip direction and optimistically reflect it. When a
			// state DataRef is configured it is the single source of truth and the
			// WS subscription drives the icon — never set it optimistically here.
			if (parsed.toggleMode && !parsed.statePath && state) {
				state.internalOn = !wasOn;
				await this.renderInternal(state);
			}

			if (!parsed.hideConfirmation) {
				await ev.action.showOk();
			}
		} catch (err) {
			streamDeck.logger.error("macro keyDown failed", err);
			await ev.action.showAlert();
		} finally {
			if (state) state.inflightKeyDown = false;
		}
	}

	override async onKeyUp(ev: KeyUpEvent<MacroSettings>): Promise<void> {
		const parsed = parseSettings(ev.payload.settings ?? {});
		// Toggle is press-driven; release does nothing.
		if (parsed.toggleMode || !parsed.releaseSteps) return;

		const { steps, errors } = parseMacro(parsed.releaseSteps);
		if (errors.length > 0) {
			for (const e of errors)
				streamDeck.logger.warn(`macro: release line ${e.line}: ${e.reason}`);
			await ev.action.showAlert();
			return;
		}
		if (steps.length === 0) return;

		const state = this.states.get(ev.action.id);
		if (state) state.cancel.cancelled = false;
		const result = await runMacro(this.xplane, steps, {
			stopOnError: parsed.stopOnError,
			selectors: selectors.snapshot(),
			signal: state?.cancel,
		});
		if (result.failed > 0) await ev.action.showAlert();
	}

	private async resolveToggleDirection(
		state: ActionState | undefined,
		parsed: ParsedSettings,
		snap: ReadonlyMap<string, number>,
	): Promise<boolean> {
		if (!parsed.statePath) return state?.internalOn ?? false;

		let current = state?.lastValue;
		if (current === undefined) {
			const resolved = substitutePlaceholders(parsed.statePath, snap);
			const { basePath, index } = parseDataRefPath(resolved);
			const id = await this.xplane.getDataRefId(basePath);
			current = applyIndex(await this.xplane.readDataRef(id), index);
		}
		return (
			mapValueToStateIndex(current, parsed.valueOff, parsed.valueOn, parsed.strictOnMatch) ===
			STATE_ON
		);
	}

	private async applySubscription(state: ActionState): Promise<void> {
		if (!state.statePath) return;

		if (this.xplane.isOffline()) {
			await setOffline(state.action);
			return;
		}

		const resolved = substitutePlaceholders(state.statePath, selectors.snapshot());
		const { basePath, index } = parseDataRefPath(resolved);

		try {
			state.handle = await this.xplane.subscribe(basePath, (raw) => {
				let value: DataRefValue;
				try {
					value = applyIndex(raw, index);
				} catch (err) {
					streamDeck.logger.warn(`macro: index apply failed for ${state.statePath}`, err);
					setNotFound(state.action).catch((e) =>
						streamDeck.logger.warn("macro: setNotFound failed", e),
					);
					return;
				}
				const prev = state.lastValue;
				state.lastValue = value;
				if (!sameValue(prev, value)) {
					streamDeck.logger.info(
						`macro: subscribe ${state.statePath} = ${describeValue(value)}`,
					);
				}
				this.renderState(state, value).catch((err) =>
					streamDeck.logger.warn("macro: render failed", err),
				);
			});

			// Seed the visible state via REST so the first frame is correct before
			// the subscription delivers its first update. Skip if the WS update
			// already landed — that is the fresher source of truth.
			try {
				const id = await this.xplane.getDataRefId(basePath);
				const initial = applyIndex(await this.xplane.readDataRef(id), index);
				if (state.lastValue === undefined) {
					state.lastValue = initial;
					await this.renderState(state, initial);
				}
			} catch (err) {
				streamDeck.logger.warn(`macro: initial read failed for ${state.statePath}`, err);
			}
		} catch (err) {
			streamDeck.logger.warn(`macro: subscribe failed for ${state.statePath}`, err);
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
			state.valueOff,
			state.valueOn,
			state.strictOnMatch,
		);
		return this.commitState(state, target);
	}

	private renderInternal(state: ActionState): Promise<void> {
		return this.commitState(state, state.internalOn ? STATE_ON : STATE_OFF);
	}

	// Serializes overlapping setState calls so an earlier update can't interleave
	// with a newer one; gated on currentState so unchanged values are skipped.
	private commitState(state: ActionState, target: number): Promise<void> {
		const previous = state.renderPromise ?? Promise.resolve();
		const next = previous
			.catch(() => {
				/* prior render error already logged; don't propagate */
			})
			.then(async () => {
				if (target === state.currentState) return;
				// Once we have valid data, drop any disconnected/not-found overlay.
				await clearTile(state.action, state.label);
				await state.action.setState(target);
				state.currentState = target;
			});
		state.renderPromise = next;
		return next;
	}

	private onXPlaneOffline(): void {
		for (const state of this.states.values()) {
			if (state.statePath) this.dropSubscription(state);
			state.currentState = STATE_DIRTY;
			setOffline(state.action).catch((err) =>
				streamDeck.logger.warn("macro: setOffline failed", err),
			);
		}
	}

	private onXPlaneOnline(): void {
		for (const state of this.states.values()) {
			if (state.statePath) {
				if (!state.handle) {
					this.applySubscription(state).catch((err) =>
						streamDeck.logger.warn(
							`macro: re-subscribe failed for ${state.statePath}`,
							err,
						),
					);
				}
			} else {
				clearOffline(state.action).catch((err) =>
					streamDeck.logger.warn("macro: clearOffline failed", err),
				);
				this.renderInternal(state).catch((err) =>
					streamDeck.logger.warn("macro: renderInternal failed", err),
				);
			}
		}
	}

	private onSelectorsChanged(changed: ReadonlySet<string>): void {
		for (const state of this.states.values()) {
			if (!state.statePath) continue;
			const keys = extractPlaceholderKeys(state.statePath);
			if (!keys.some((k) => changed.has(k))) continue;
			this.dropSubscription(state);
			state.lastValue = undefined;
			state.currentState = STATE_DIRTY;
			this.applySubscription(state).catch((err) =>
				streamDeck.logger.warn(
					`macro: selector re-subscribe failed for ${state.statePath}`,
					err,
				),
			);
		}
	}
}

function parseSettings(s: MacroSettings): ParsedSettings {
	return {
		label: trimString(s.label),
		pressSteps: typeof s.pressSteps === "string" ? s.pressSteps : "",
		releaseSteps: typeof s.releaseSteps === "string" ? s.releaseSteps : "",
		toggleMode: s.toggleMode === true,
		onSteps: typeof s.onSteps === "string" ? s.onSteps : "",
		offSteps: typeof s.offSteps === "string" ? s.offSteps : "",
		statePath: trimString(s.stateDataRefPath),
		valueOff: toFiniteNumber(s.valueOff) ?? 0,
		valueOn: toFiniteNumber(s.valueOn) ?? 1,
		strictOnMatch: s.strictOnMatch === true,
		stopOnError: s.stopOnError === true,
		hideConfirmation: s.hideConfirmation === true,
	};
}

function sameValue(a: DataRefValue | undefined, b: DataRefValue): boolean {
	if (a === undefined) return false;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) return false;
		}
		return true;
	}
	return a === b;
}

function mapValueToStateIndex(
	value: DataRefValue,
	valueOff: number,
	valueOn: number,
	strictOnMatch: boolean,
): typeof STATE_OFF | typeof STATE_ON {
	const num = coerceNumber(value);
	if (num === undefined) return STATE_OFF;
	if (strictOnMatch) {
		return Math.abs(num - valueOn) < TOLERANCE_FLOAT ? STATE_ON : STATE_OFF;
	}
	if (valueOff === 0 && valueOn === 1) {
		return num >= 0.5 ? STATE_ON : STATE_OFF;
	}
	const dOff = Math.abs(num - valueOff);
	const dOn = Math.abs(num - valueOn);
	return dOn < dOff ? STATE_ON : STATE_OFF;
}
