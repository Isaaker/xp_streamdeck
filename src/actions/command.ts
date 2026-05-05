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

import { clearTile, setDisconnected } from "../util/error-tile";
import type { XPlaneClient } from "../xplane";

type CommandSettings = JsonObject & {
	commandPath?: string;
	holdMode?: boolean;
	hideConfirmation?: boolean;
};

@action({ UUID: "com.robertw.xplane.command" })
export class XPlaneCommand extends SingletonAction<CommandSettings> {
	private readonly visible = new Map<string, KeyAction<CommandSettings>>();

	constructor(private readonly xplane: XPlaneClient) {
		super();
		this.xplane.on("disconnected", () => this.onXPlaneDisconnected());
		this.xplane.on("connected", () => this.onXPlaneConnected());
	}

	override async onWillAppear(ev: WillAppearEvent<CommandSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		this.visible.set(ev.action.id, ev.action);
		if (this.xplane.status() !== "connected") {
			await setDisconnected(ev.action);
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<CommandSettings>): Promise<void> {
		this.visible.delete(ev.action.id);
		return Promise.resolve();
	}

	override async onKeyDown(ev: KeyDownEvent<CommandSettings>): Promise<void> {
		const path = ev.payload.settings?.commandPath?.trim();
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
			if (!hideConfirmation) {
				await ev.action.showOk();
			}
		} catch (err) {
			streamDeck.logger.error(`command failed: ${path}`, err);
			await ev.action.showAlert();
		}
	}

	override async onKeyUp(ev: KeyUpEvent<CommandSettings>): Promise<void> {
		const path = ev.payload.settings?.commandPath?.trim();
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

	private onXPlaneDisconnected(): void {
		for (const a of this.visible.values()) {
			setDisconnected(a).catch((err) =>
				streamDeck.logger.warn("command: setDisconnected failed", err),
			);
		}
	}

	private onXPlaneConnected(): void {
		for (const a of this.visible.values()) {
			clearTile(a).catch((err) => streamDeck.logger.warn("command: clearTile failed", err));
		}
	}
}
