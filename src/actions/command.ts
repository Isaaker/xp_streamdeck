import streamDeck, {
	action,
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
import { clearOffline, setOffline } from "../util/error-tile";
import { substitutePlaceholders } from "../util/placeholders";
import { trimString } from "../util/settings";
import type { XPlaneClient } from "../xplane";

type CommandSettings = JsonObject & {
	commandPath?: string;
	holdMode?: boolean;
	autoRepeat?: boolean;
	hideConfirmation?: boolean;
};

type Repeater = {
	initial: NodeJS.Timeout | null;
	interval: NodeJS.Timeout | null;
};

@action({ UUID: "com.robertw.xplane.command" })
export class XPlaneCommand extends SingletonAction<CommandSettings> {
	private readonly visible = new Map<string, KeyAction<CommandSettings>>();
	private readonly repeaters = new Map<string, Repeater>();

	constructor(private readonly xplane: XPlaneClient) {
		super();
		this.xplane.on("offline", () => this.onXPlaneOffline());
		this.xplane.on("online", () => this.onXPlaneOnline());
	}

	override async onWillAppear(ev: WillAppearEvent<CommandSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		this.visible.set(ev.action.id, ev.action);
		if (this.xplane.isOffline()) {
			await setOffline(ev.action);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<CommandSettings>): Promise<void> {
		this.stopRepeater(ev.action.id);
		this.visible.delete(ev.action.id);
		return Promise.resolve();
	}

	override async onKeyDown(ev: KeyDownEvent<CommandSettings>): Promise<void> {
		const rawPath = trimString(ev.payload.settings?.commandPath);
		const path = substitutePlaceholders(rawPath, selectors.snapshot());
		const holdMode = ev.payload.settings?.holdMode === true;
		const hideConfirmation = ev.payload.settings?.hideConfirmation === true;

		if (!path) {
			streamDeck.logger.warn("command: commandPath is empty");
			await ev.action.showAlert();
			return;
		}

		try {
			const id = await this.xplane.getCommandId(path);
			if (holdMode) {
				await this.xplane.beginCommand(id);
				streamDeck.logger.info(`command begin: ${path} (id=${id})`);
			} else {
				await this.xplane.activateCommand(id);
				streamDeck.logger.info(`command activate: ${path} (id=${id})`);
			}
			if (!holdMode && ev.payload.settings?.autoRepeat === true) {
				this.startRepeater(ev.action.id, id, path);
			}
			if (!hideConfirmation) {
				await ev.action.showOk();
			}
		} catch (err) {
			streamDeck.logger.error(`command failed: ${path}`, err);
			await ev.action.showAlert();
		}
	}

	override async onKeyUp(ev: KeyUpEvent<CommandSettings>): Promise<void> {
		this.stopRepeater(ev.action.id);

		const rawPath = trimString(ev.payload.settings?.commandPath);
		const path = substitutePlaceholders(rawPath, selectors.snapshot());
		const holdMode = ev.payload.settings?.holdMode === true;

		if (!holdMode || !path) return;

		try {
			const id = await this.xplane.getCommandId(path);
			await this.xplane.endCommand(id);
			streamDeck.logger.info(`command end: ${path} (id=${id})`);
		} catch (err) {
			streamDeck.logger.error(`command end failed: ${path}`, err);
			await ev.action.showAlert();
		}
	}

	private onXPlaneOffline(): void {
		for (const id of [...this.repeaters.keys()]) {
			this.stopRepeater(id);
		}
		for (const a of this.visible.values()) {
			setOffline(a).catch((err) => streamDeck.logger.warn("command: setOffline failed", err));
		}
	}

	private startRepeater(actionId: string, commandId: number, path: string): void {
		this.stopRepeater(actionId);
		const entry: Repeater = { initial: null, interval: null };
		entry.initial = setTimeout(() => {
			entry.interval = setInterval(() => {
				this.xplane
					.activateCommand(commandId)
					.catch((err) => streamDeck.logger.error(`command repeat failed: ${path}`, err));
			}, TIMINGS.REPEAT_INTERVAL_MS);
		}, TIMINGS.REPEAT_INITIAL_DELAY_MS);
		this.repeaters.set(actionId, entry);
	}

	private stopRepeater(actionId: string): void {
		const r = this.repeaters.get(actionId);
		if (!r) return;
		if (r.initial) clearTimeout(r.initial);
		if (r.interval) clearInterval(r.interval);
		this.repeaters.delete(actionId);
	}

	private onXPlaneOnline(): void {
		for (const a of this.visible.values()) {
			clearOffline(a).catch((err) =>
				streamDeck.logger.warn("command: clearOffline failed", err),
			);
		}
	}
}
