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
