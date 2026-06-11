/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

export function trimString(v: unknown): string {
	return typeof v === "string" ? v.trim() : "";
}

export function trimStringOr(v: unknown, fallback: string): string {
	const trimmed = trimString(v);
	return trimmed.length > 0 ? trimmed : fallback;
}

export function normalizeFormat(v: unknown): string {
	return trimStringOr(v, "%s");
}
