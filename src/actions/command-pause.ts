import streamDeck, { action, KeyDownEvent, SingletonAction } from "@elgato/streamdeck";

import type { XPlaneClient } from "../xplane";

const COMMAND_NAME = "sim/operation/pause_toggle";

@action({ UUID: "com.robertw.xplane.command-pause" })
export class CommandPause extends SingletonAction {
	constructor(private readonly xplane: XPlaneClient) {
		super();
	}

	override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
		try {
			const id = await this.xplane.getCommandId(COMMAND_NAME);
			await this.xplane.activateCommand(id);
			streamDeck.logger.info(`Activated ${COMMAND_NAME} (id=${id})`);
		} catch (err) {
			streamDeck.logger.error(`Pause toggle failed`, err);
		}
	}
}
