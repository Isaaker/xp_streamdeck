import streamDeck, {
	type DidReceiveSettingsEvent,
	SingletonAction,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import { applyIndex, parseDataRefPath } from "../../util/dataref-path";
import { clearOffline, combineTitle, NOT_FOUND_SUFFIX, setOffline } from "../../util/error-tile";
import type { DataRefValue, SubscriptionHandle, XPlaneClient } from "../../xplane";

/**
 * Shared shape for any action that subscribes to a single DataRef and renders
 * its value as a tile title. Subclasses extend this with their own format /
 * unitScale / precision / etc fields.
 *
 * `path` is the *subscription* path: subclasses that conditionally subscribe
 * (e.g. dataref-write with `showCurrentValue=false`) return `""` here and the
 * base treats it as "no subscription, just show the label".
 */
export interface SubscribableState<TSettings extends JsonObject> {
	action: WillAppearEvent<TSettings>["action"];
	path: string;
	label: string;
	handle?: SubscriptionHandle;
	lastValue?: DataRefValue;
}

/**
 * Base class for display-only style actions that follow the same subscription
 * lifecycle: subscribe on appear / path change, drop on disappear, swap to the
 * offline placeholder on X-Plane disconnect, re-subscribe on reconnect.
 *
 * Error-feedback contract (consistent across every subclass):
 *  - `onKeyDown` errors → `showAlert()` is the subclass's responsibility.
 *  - Subscribe rejection / `applyIndex` throw → base sets the `?` not-found
 *    suffix on the title and calls `showAlert()` (the alert fires only for
 *    subscribe rejection — index errors only repaint the title).
 *  - X-Plane offline → base swaps to the offline placeholder image.
 *
 * Visual feedback paths are *never* gated by settings. The user always sees
 * when the action can't reach its DataRef.
 */
export abstract class SubscribableAction<
	TSettings extends JsonObject,
	TState extends SubscribableState<TSettings>,
> extends SingletonAction<TSettings> {
	protected readonly states = new Map<string, TState>();

	constructor(
		protected readonly xplane: XPlaneClient,
		private readonly logName: string,
	) {
		super();
		this.xplane.on("offline", () => this.onXPlaneOffline());
		this.xplane.on("online", () => this.onXPlaneOnline());
	}

	protected abstract createState(ev: WillAppearEvent<TSettings>): TState;

	protected abstract updateStateFromSettings(
		state: TState,
		ev: DidReceiveSettingsEvent<TSettings>,
	): { pathChanged: boolean };

	protected abstract render(state: TState): void;

	override async onWillAppear(ev: WillAppearEvent<TSettings>): Promise<void> {
		const state = this.createState(ev);
		this.states.set(ev.action.id, state);
		await this.applySubscription(state);
	}

	override onWillDisappear(ev: WillDisappearEvent<TSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return Promise.resolve();
		this.dropSubscription(state);
		this.states.delete(ev.action.id);
		return Promise.resolve();
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<TSettings>): Promise<void> {
		const state = this.states.get(ev.action.id);
		if (!state) return;

		const { pathChanged } = this.updateStateFromSettings(state, ev);

		if (pathChanged) {
			this.dropSubscription(state);
			state.lastValue = undefined;
			await this.applySubscription(state);
			return;
		}

		this.render(state);
	}

	protected async applySubscription(state: TState): Promise<void> {
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
						`${this.logName}: index apply failed for ${state.path}`,
						err,
					);
					state.action
						.setTitle(combineTitle(state.label, NOT_FOUND_SUFFIX))
						.catch((e) =>
							streamDeck.logger.warn(`${this.logName}: setTitle failed`, e),
						);
				}
			});
		} catch (err) {
			streamDeck.logger.warn(`${this.logName}: subscribe failed for ${state.path}`, err);
			await state.action.setTitle(combineTitle(state.label, NOT_FOUND_SUFFIX));
			await state.action.showAlert();
		}
	}

	protected dropSubscription(state: TState): void {
		if (state.handle) {
			this.xplane.unsubscribe(state.handle);
			state.handle = undefined;
		}
	}

	private onXPlaneOffline(): void {
		for (const state of this.states.values()) {
			this.dropSubscription(state);
			state.lastValue = undefined;
			setOffline(state.action).catch((err) =>
				streamDeck.logger.warn(`${this.logName}: setOffline failed`, err),
			);
		}
	}

	private onXPlaneOnline(): void {
		for (const state of this.states.values()) {
			clearOffline(state.action)
				.then(() => this.applySubscription(state))
				.catch((err) =>
					streamDeck.logger.warn(`${this.logName}: re-subscribe failed`, err),
				);
		}
	}
}
