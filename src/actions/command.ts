import streamDeck, {
	action,
	type KeyDownEvent,
	type KeyUpEvent,
	SingletonAction,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import type { XPlaneClient } from "../xplane";

type CommandSettings = JsonObject & {
	commandPath?: string;
	holdMode?: boolean;
};

@action({ UUID: "com.robertw.xplane.command" })
export class XPlaneCommand extends SingletonAction<CommandSettings> {
	constructor(private readonly xplane: XPlaneClient) {
		super();
	}

	override async onKeyDown(ev: KeyDownEvent<CommandSettings>): Promise<void> {
		const path = ev.payload.settings?.commandPath?.trim();
		const holdMode = ev.payload.settings?.holdMode === true;

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
			await ev.action.showOk();
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
}
