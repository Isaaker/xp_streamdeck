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

/**
 * Treat the first line of an incoming title as the user-provided label.
 * When the plugin renders multi-line titles like "ALT\n3000" Stream Deck
 * may echo that text back via onTitleParametersDidChange — only the first
 * line is meaningful as user input.
 */
export function extractUserTitle(incoming: string): string {
	if (!incoming) return "";
	const idx = incoming.indexOf("\n");
	return idx === -1 ? incoming : incoming.slice(0, idx);
}

/**
 * Read the user-supplied title from a willAppear-style payload. The Stream
 * Deck wire protocol carries it on the payload, but the @elgato/streamdeck
 * SDK 2.x typings omit it from the SingleActionPayload union. Cast around
 * the gap and default to empty.
 */
export function readPayloadTitle(payload: unknown): string {
	if (payload && typeof payload === "object" && "title" in payload) {
		const v = (payload as { title?: unknown }).title;
		return typeof v === "string" ? v : "";
	}
	return "";
}

export function setDisconnected<T extends JsonObject>(
	action: KeyAction<T>,
	userTitle = "",
): Promise<void> {
	return action.setTitle(combineTitle(userTitle, DISCONNECTED_SUFFIX)).catch((err) => {
		streamDeck.logger.warn("error-tile: setTitle disconnected failed", err);
	});
}

export function setNotFound<T extends JsonObject>(
	action: KeyAction<T>,
	userTitle = "",
): Promise<void> {
	return action.setTitle(combineTitle(userTitle, NOT_FOUND_SUFFIX)).catch((err) => {
		streamDeck.logger.warn("error-tile: setTitle not-found failed", err);
	});
}

export function clearTile<T extends JsonObject>(
	action: KeyAction<T>,
	userTitle = "",
): Promise<void> {
	return action.setTitle(userTitle).catch((err) => {
		streamDeck.logger.warn("error-tile: clearTitle failed", err);
	});
}
