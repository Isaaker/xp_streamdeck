/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

/**
 * Manual smoke test for src/xplane/. Run with: `npm run smoke`.
 *
 * Requires X-Plane 12.1.1+ running locally with an aircraft loaded.
 * Resolves an ID, reads a DataRef, writes back the same value, and
 * subscribes for 5 seconds — printing every update.
 *
 * Override targets via env: READ_DATAREF, SUBSCRIBE_DATAREF.
 */

import { setTimeout as sleep } from "node:timers/promises";

import { XPlaneClient } from "../src/xplane";

const READ_DATAREF = process.env.READ_DATAREF ?? "sim/cockpit2/clock_timer/zulu_time_seconds";
const SUBSCRIBE_DATAREF = process.env.SUBSCRIBE_DATAREF ?? READ_DATAREF;

const log = (msg: string, ...args: unknown[]) => console.log(`[smoke] ${msg}`, ...args);

async function main(): Promise<void> {
	const client = new XPlaneClient({
		logger: {
			info: (m, ...a) => log(m, ...a),
			warn: (m, ...a) => console.warn(`[smoke] ${m}`, ...a),
			error: (m, ...a) => console.error(`[smoke] ${m}`, ...a),
			debug: (m, ...a) => console.debug(`[smoke] ${m}`, ...a),
		},
	});

	client.on("connected", () => log("event: connected"));
	client.on("disconnected", () => log("event: disconnected"));
	client.on("error", (err) => log("event: error", err));

	try {
		log(`resolving id for ${READ_DATAREF}`);
		const id = await client.getDataRefId(READ_DATAREF);
		log(`  -> id=${id}`);

		log("reading value");
		const value = await client.readDataRef(id);
		log(`  -> value=${JSON.stringify(value)}`);

		if (typeof value === "number") {
			log(`writing value back unchanged (${value})`);
			try {
				await client.writeDataRef(id, value);
				log("  -> write OK");
			} catch (err) {
				log("  -> write failed (likely read-only DataRef)", (err as Error).message);
			}
		} else {
			log("skipping write (value is not a number)");
		}

		log(`subscribing to ${SUBSCRIBE_DATAREF} for 5s`);
		const handle = await client.subscribe(SUBSCRIBE_DATAREF, (v) => {
			log(`  update: ${JSON.stringify(v)}`);
		});
		await sleep(5000);
		client.unsubscribe(handle);
		log("unsubscribed");
	} finally {
		client.close();
	}
}

main().catch((err) => {
	console.error("[smoke] fatal", err);
	process.exit(1);
});
