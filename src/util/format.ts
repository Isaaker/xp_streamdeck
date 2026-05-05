import type { DataRefValue } from "../xplane";

export interface FormatOptions {
	format?: string;
	unitScale?: number;
	precision?: number;
}

const DEFAULT_FORMAT = "%s";
const PRINTF_DEFAULT_FLOAT_PRECISION = 6;

const TOKEN_RE = /%(?:(\d*)(?:\.(\d+))?)?([sdif%])/g;

export function formatDataRefValue(value: DataRefValue, opts: FormatOptions = {}): string {
	const format = opts.format && opts.format.length > 0 ? opts.format : DEFAULT_FORMAT;
	const fallbackPrecision = opts.precision;
	const scalar = scalarOf(value);

	return format.replace(TOKEN_RE, (_match, _width, tokenPrecision, type) => {
		if (type === "%") return "%";

		const explicitPrecision = tokenPrecision !== undefined ? Number(tokenPrecision) : undefined;
		const precision = explicitPrecision ?? fallbackPrecision;

		if (type === "s") {
			if (typeof scalar === "number" && precision !== undefined) {
				return scaleNumber(scalar, opts.unitScale).toFixed(precision);
			}
			if (typeof scalar === "number") {
				return scaleNumber(scalar, opts.unitScale).toString();
			}
			return stringifyScalar(scalar);
		}

		if (type === "d" || type === "i") {
			const n = scaleNumber(toNumber(scalar), opts.unitScale);
			return Math.trunc(n).toString();
		}

		if (type === "f") {
			const n = scaleNumber(toNumber(scalar), opts.unitScale);
			return n.toFixed(precision ?? PRINTF_DEFAULT_FLOAT_PRECISION);
		}

		return "";
	});
}

function scalarOf(value: DataRefValue): number | string | boolean {
	if (Array.isArray(value)) return value[0] ?? 0;
	return value;
}

function scaleNumber(n: number, scale?: number): number {
	if (scale === undefined || !Number.isFinite(scale)) return n;
	return n * scale;
}

function toNumber(v: number | string | boolean): number {
	if (typeof v === "number") return v;
	if (typeof v === "boolean") return v ? 1 : 0;
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
}

function stringifyScalar(v: number | string | boolean): string {
	if (typeof v === "boolean") return v ? "true" : "false";
	return String(v);
}
