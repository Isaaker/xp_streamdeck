import streamDeck, {
	action,
	type KeyAction,
	type KeyDownEvent,
	type KeyUpEvent,
	SingletonAction,
	type TitleParametersDidChangeEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

import {
	combineTitle,
	DISCONNECTED_SUFFIX,
	extractUserTitle,
	readPayloadTitle,
} from "../util/error-tile";
import type { XPlaneClient } from "../xplane";

type CommandSettings = JsonObject & {
	commandPath?: string;
	holdMode?: boolean;
	hideConfirmation?: boolean;
};

interface VisibleEntry {
	action: KeyAction<CommandSettings>;
	userTitle: string;
	lastRenderedTitle: string;
}

@action({ UUID: "com.robertw.xplane.command" })
export class XPlaneCommand extends SingletonAction<CommandSettings> {
	private readonly visible = new Map<string, VisibleEntry>();

	constructor(private readonly xplane: XPlaneClient) {
		super();
		this.xplane.on("disconnected", () => this.onXPlaneDisconnected());
		this.xplane.on("connected", () => this.onXPlaneConnected());
	}

	override async onWillAppear(ev: WillAppearEvent<CommandSettings>): Promise<void> {
		if (!ev.action.isKey()) return;
		const entry: VisibleEntry = {
			action: ev.action,
			userTitle: readPayloadTitle(ev.payload),
			lastRenderedTitle: "",
		};
		this.visible.set(ev.action.id, entry);
		if (this.xplane.status() !== "connected") {
			await this.applyTitle(entry, combineTitle(entry.userTitle, DISCONNECTED_SUFFIX));
		}
	}

	override onWillDisappear(ev: WillDisappearEvent<CommandSettings>): Promise<void> {
		this.visible.delete(ev.action.id);
		return Promise.resolve();
	}

	override onTitleParametersDidChange(
		ev: TitleParametersDidChangeEvent<CommandSettings>,
	): Promise<void> {
		const entry = this.visible.get(ev.action.id);
		if (!entry) return Promise.resolve();
		const incoming = ev.payload.title ?? "";
		if (incoming === entry.lastRenderedTitle) return Promise.resolve();
		entry.userTitle = extractUserTitle(incoming);
		entry.lastRenderedTitle = "";
		// If currently disconnected, repaint the suffix on top of the new label.
		if (this.xplane.status() !== "connected") {
			this.applyTitle(entry, combineTitle(entry.userTitle, DISCONNECTED_SUFFIX)).catch(
				(err) => streamDeck.logger.warn("command: setTitle failed", err),
			);
		}
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

	private async applyTitle(entry: VisibleEntry, text: string): Promise<void> {
		entry.lastRenderedTitle = text;
		await entry.action.setTitle(text);
	}

	private onXPlaneDisconnected(): void {
		for (const entry of this.visible.values()) {
			this.applyTitle(entry, combineTitle(entry.userTitle, DISCONNECTED_SUFFIX)).catch(
				(err) => streamDeck.logger.warn("command: setTitle failed", err),
			);
		}
	}

	private onXPlaneConnected(): void {
		for (const entry of this.visible.values()) {
			this.applyTitle(entry, entry.userTitle).catch((err) =>
				streamDeck.logger.warn("command: setTitle failed", err),
			);
		}
	}
}
