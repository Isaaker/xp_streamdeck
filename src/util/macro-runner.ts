/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

import streamDeck from "@elgato/streamdeck";

import type { XPlaneClient } from "../xplane";
import { parseDataRefPath } from "./dataref-path";
import { describeStep, type MacroStep } from "./macro-dsl";
import { substitutePlaceholders } from "./placeholders";

export interface MacroRunOptions {
	stopOnError: boolean;
	selectors: ReadonlyMap<string, number>;
	// Cooperative cancellation — checked before each step so a button that
	// disappears (or a new press) can abort a sequence that is still in flight.
	signal?: { cancelled: boolean };
}

export interface MacroRunResult {
	ran: number;
	failed: number;
	cancelled: boolean;
}

/**
 * Execute the steps in order, awaiting each. Paths are resolved against the
 * selector snapshot immediately before each call (session-scoped IDs are never
 * cached across steps). With stopOnError the run aborts on the first failure;
 * otherwise it best-effort continues and counts failures.
 */
export async function runMacro(
	xplane: XPlaneClient,
	steps: MacroStep[],
	opts: MacroRunOptions,
): Promise<MacroRunResult> {
	let ran = 0;
	let failed = 0;
	for (const step of steps) {
		if (opts.signal?.cancelled) return { ran, failed, cancelled: true };
		try {
			await runStep(xplane, step, opts);
			ran++;
		} catch (err) {
			failed++;
			streamDeck.logger.error(`macro: step failed (${describeStep(step)})`, err);
			if (opts.stopOnError) return { ran, failed, cancelled: false };
		}
	}
	return { ran, failed, cancelled: false };
}

async function runStep(
	xplane: XPlaneClient,
	step: MacroStep,
	opts: MacroRunOptions,
): Promise<void> {
	switch (step.kind) {
		case "cmd": {
			const path = substitutePlaceholders(step.path, opts.selectors);
			const id = await xplane.getCommandId(path);
			await xplane.activateCommand(id);
			streamDeck.logger.info(`macro: cmd ${path} (id=${id})`);
			return;
		}
		case "begin": {
			const path = substitutePlaceholders(step.path, opts.selectors);
			const id = await xplane.getCommandId(path);
			await xplane.beginCommand(id);
			streamDeck.logger.info(`macro: begin ${path} (id=${id})`);
			return;
		}
		case "end": {
			const path = substitutePlaceholders(step.path, opts.selectors);
			const id = await xplane.getCommandId(path);
			await xplane.endCommand(id);
			streamDeck.logger.info(`macro: end ${path} (id=${id})`);
			return;
		}
		case "write": {
			const resolved = substitutePlaceholders(step.path, opts.selectors);
			const { basePath, index } = parseDataRefPath(resolved);
			const id = await xplane.getDataRefId(basePath);
			await xplane.writeDataRef(id, step.value, index);
			streamDeck.logger.info(`macro: write ${resolved} = ${step.value} (id=${id})`);
			return;
		}
		case "delay":
			await new Promise<void>((resolve) => setTimeout(resolve, step.ms));
			return;
	}
}
