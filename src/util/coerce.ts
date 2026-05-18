import type { DataRefValue } from "../xplane";

export function toFiniteNumber(v: unknown): number | undefined {
	if (v === undefined || v === null || v === "") return undefined;
	const n = typeof v === "number" ? v : Number(v);
	return Number.isFinite(n) ? n : undefined;
}

export function coerceNumber(v: DataRefValue): number | undefined {
	if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
	if (typeof v === "boolean") return v ? 1 : 0;
	if (typeof v === "string") {
		const n = Number(v);
		return Number.isFinite(n) ? n : undefined;
	}
	if (Array.isArray(v) && v.length > 0 && typeof v[0] === "number") {
		return Number.isFinite(v[0]) ? v[0] : undefined;
	}
	return undefined;
}

export function describeValue(v: DataRefValue): string {
	if (Array.isArray(v)) return `[${v.slice(0, 4).join(",")}${v.length > 4 ? ",…" : ""}]`;
	return `${v} (${typeof v})`;
}
