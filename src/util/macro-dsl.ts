/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

import { toFiniteNumber } from "./coerce";

// One step of a macro. Paths are kept raw (incl. any [index] suffix and {KEY}
// placeholders) — they are resolved at execution time because DataRef/Command
// IDs are session-scoped and placeholder values can change between presses.
export type MacroStep =
	| { kind: "cmd"; path: string }
	| { kind: "begin"; path: string }
	| { kind: "end"; path: string }
	| { kind: "write"; path: string; value: number }
	| { kind: "delay"; ms: number };

export interface MacroParseError {
	line: number;
	text: string;
	reason: string;
}

export interface MacroParseResult {
	steps: MacroStep[];
	errors: MacroParseError[];
}

/**
 * Parse the line-based macro DSL. One step per line; blank lines and `#`
 * comments are ignored. Grammar:
 *
 *   cmd   <commandPath>
 *   begin <commandPath>
 *   end   <commandPath>
 *   write <datarefPath>[idx] = <value>
 *   delay <ms>
 *
 * The parser validates shape only — it never resolves placeholders or IDs.
 * Invalid lines are collected into `errors` (1-based line numbers) and skipped
 * so the caller can surface them via showAlert without aborting the whole parse.
 */
export function parseMacro(text: string): MacroParseResult {
	const steps: MacroStep[] = [];
	const errors: MacroParseError[] = [];
	if (!text) return { steps, errors };

	const lines = text.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const lineNo = i + 1;
		const raw = lines[i];
		const stripped = stripComment(raw).trim();
		if (stripped === "") continue;
		const step = parseLine(stripped, lineNo, raw, errors);
		if (step) steps.push(step);
	}
	return { steps, errors };
}

// DataRef and Command paths never contain '#', so anything from the first '#'
// is a trailing comment.
function stripComment(line: string): string {
	const hash = line.indexOf("#");
	return hash === -1 ? line : line.slice(0, hash);
}

function parseLine(
	line: string,
	lineNo: number,
	raw: string,
	errors: MacroParseError[],
): MacroStep | undefined {
	const spaceIdx = line.search(/\s/);
	const verb = (spaceIdx === -1 ? line : line.slice(0, spaceIdx)).toLowerCase();
	const rest = spaceIdx === -1 ? "" : line.slice(spaceIdx + 1).trim();

	switch (verb) {
		case "cmd":
		case "begin":
		case "end": {
			if (!rest) {
				errors.push({ line: lineNo, text: raw, reason: `${verb}: missing command path` });
				return undefined;
			}
			return { kind: verb, path: rest };
		}
		case "write": {
			const eq = rest.indexOf("=");
			if (eq === -1) {
				errors.push({ line: lineNo, text: raw, reason: "write: missing '='" });
				return undefined;
			}
			const path = rest.slice(0, eq).trim();
			const valueStr = rest.slice(eq + 1).trim();
			if (!path) {
				errors.push({ line: lineNo, text: raw, reason: "write: missing DataRef path" });
				return undefined;
			}
			const value = toFiniteNumber(valueStr);
			if (value === undefined) {
				errors.push({
					line: lineNo,
					text: raw,
					reason: `write: invalid numeric value "${valueStr}"`,
				});
				return undefined;
			}
			return { kind: "write", path, value };
		}
		case "delay": {
			const ms = toFiniteNumber(rest);
			if (ms === undefined || ms < 0) {
				errors.push({
					line: lineNo,
					text: raw,
					reason: `delay: invalid milliseconds "${rest}"`,
				});
				return undefined;
			}
			return { kind: "delay", ms };
		}
		default:
			errors.push({ line: lineNo, text: raw, reason: `unknown step "${verb}"` });
			return undefined;
	}
}

export function describeStep(step: MacroStep): string {
	switch (step.kind) {
		case "delay":
			return `delay ${step.ms}`;
		case "write":
			return `write ${step.path} = ${step.value}`;
		default:
			return `${step.kind} ${step.path}`;
	}
}
