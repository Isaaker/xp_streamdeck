import streamDeck, { type KeyAction } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

export const DISCONNECTED_TITLE = "X-Plane";
export const NOT_FOUND_TITLE = "?";

export function setDisconnected<T extends JsonObject>(action: KeyAction<T>): Promise<void> {
	return action.setTitle(DISCONNECTED_TITLE).catch((err) => {
		streamDeck.logger.warn("error-tile: setTitle disconnected failed", err);
	});
}

export function setNotFound<T extends JsonObject>(action: KeyAction<T>): Promise<void> {
	return action.setTitle(NOT_FOUND_TITLE).catch((err) => {
		streamDeck.logger.warn("error-tile: setTitle not-found failed", err);
	});
}

export function clearTile<T extends JsonObject>(action: KeyAction<T>): Promise<void> {
	return action.setTitle("").catch((err) => {
		streamDeck.logger.warn("error-tile: clearTitle failed", err);
	});
}
