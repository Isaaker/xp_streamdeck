import streamDeck, { type KeyAction } from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

export const DISCONNECTED_SUFFIX = "X-Plane";
export const NOT_FOUND_SUFFIX = "?";

/**
 * Stack a user-provided title on top of a status/value suffix. Returning the
 * combined string lets each action call setTitle() once, preserving the label
 * the user typed in Stream Deck's Title field.
 */
export function combineTitle(userTitle: string, suffix: string): string {
	if (!userTitle) return suffix;
	if (!suffix) return userTitle;
	return `${userTitle}\n${suffix}`;
}

export function setDisconnected<T extends JsonObject>(
	action: KeyAction<T>,
	label = "",
): Promise<void> {
	return action.setTitle(combineTitle(label, DISCONNECTED_SUFFIX)).catch((err) => {
		streamDeck.logger.warn("error-tile: setTitle disconnected failed", err);
	});
}

export function setNotFound<T extends JsonObject>(action: KeyAction<T>, label = ""): Promise<void> {
	return action.setTitle(combineTitle(label, NOT_FOUND_SUFFIX)).catch((err) => {
		streamDeck.logger.warn("error-tile: setTitle not-found failed", err);
	});
}

export function clearTile<T extends JsonObject>(action: KeyAction<T>, label = ""): Promise<void> {
	return action.setTitle(label).catch((err) => {
		streamDeck.logger.warn("error-tile: clearTitle failed", err);
	});
}
