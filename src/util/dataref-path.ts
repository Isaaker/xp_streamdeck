import type { DataRefValue } from "../xplane";

export interface ParsedDataRefPath {
	basePath: string;
	index?: number;
}

const PATH_RE = /^(.+?)(?:\[(\d+)\])?$/;

export function parseDataRefPath(input: string): ParsedDataRefPath {
	const trimmed = input.trim();
	const m = PATH_RE.exec(trimmed);
	if (!m) return { basePath: trimmed };
	const basePath = m[1];
	const index = m[2] !== undefined ? Number(m[2]) : undefined;
	return { basePath, index };
}

export function applyIndex(value: DataRefValue, index: number | undefined): DataRefValue {
	if (index === undefined) return value;
	if (!Array.isArray(value)) {
		throw new Error(`DataRef is not an array but [${index}] was given`);
	}
	if (index < 0 || index >= value.length) {
		throw new Error(`Index ${index} out of bounds (array length ${value.length})`);
	}
	return value[index];
}
