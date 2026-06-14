/*
 * xp_streamdeck - Stream Deck plugin for X-Plane 12
 * Copyright (c) 2026 thWelly
 *
 * Licensed under the MIT License.
 * See the LICENSE file in the project root for full license text.
 */

/*
 * Convert a PilotsDeck `.streamDeckProfile` into an xp_streamdeck profile.
 *
 * Both plugins ship the same `.streamDeckProfile` container (a ZIP of
 * `<UUID>.sdProfile/.../manifest.json` with `Controllers[].Actions["row,col"]`
 * buttons). This tool rewrites each button's action UUID + Settings to the
 * closest xp_streamdeck action, clears addresses the Web API cannot reach
 * (FlyWithLua / Lvar), and reports everything that needs manual rework.
 *
 * Cross-platform by design: pure JS ZIP via `fflate`, no AppleScript, no shell
 * `zip`/`unzip` (unlike the macOS-only `sync-profiles.ts`). Runs on Windows and
 * macOS via `tsx`. The output profile is hardware/OS-neutral and imports on any
 * Stream Deck.
 *
 *   npx tsx scripts/convert-pilotsdeck.ts <input.streamDeckProfile> [output.streamDeckProfile]
 */

import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { unzipSync, zipSync } from "fflate";

const OUR_PLUGIN_UUID = "com.robertw.xplane";
const OUR_PLUGIN_NAME = "X-Plane";
const OUR_PLUGIN_VERSION = "1.5.0.0";

// Mirror of sync-profiles.ts neutralization intent: strip the hardware-bound
// device binding so the profile imports on any Stream Deck / OS.
const NEUTRAL_DEVICE_UUID = "";
const NEUTRAL_PAGE_UUID = "00000000-0000-0000-0000-000000000000";

const NATIVE_PROFILE_PREFIX = "com.elgato.streamdeck.profile.";
const PD_PREFIX = "com.extension.pilotsdeck.";

type Json = Record<string, unknown>;

interface Warning {
	manifest: string;
	coord: string;
	kind: string;
	detail: string;
}

interface Report {
	pages: number;
	buttons: number;
	passthrough: number;
	command: number;
	toggle: number;
	display: number;
	clearedAddresses: Warning[];
	gaugeDowngrades: Warning[];
	korryNotes: Warning[];
	unknownActions: Warning[];
}

function isObject(v: unknown): v is Json {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
	return typeof v === "string" ? v.trim() : "";
}

/** A Web-API-reachable address starts with a real X-Plane dataref/command root. */
function isNativeAddress(addr: string): boolean {
	return addr.startsWith("sim/") || addr.startsWith("laminar/");
}

/**
 * Keep a native address, clear + record anything else (FlyWithLua `LuaToggle:…`,
 * `Lvar…`, etc.). Returns "" for empty or non-native input.
 */
function nativeOrClear(
	raw: unknown,
	ctx: { report: Report; manifest: string; coord: string; field: string },
): string {
	const addr = str(raw);
	if (addr === "") return "";
	if (isNativeAddress(addr)) return addr;
	ctx.report.clearedAddresses.push({
		manifest: ctx.manifest,
		coord: ctx.coord,
		kind: ctx.field,
		detail: addr,
	});
	return "";
}

/**
 * Translate a PilotsDeck `Format` (e.g. `"0.0:%s %"`) into our printf format +
 * precision. Best-effort: a leading `N.M:` decimal pattern sets the precision,
 * the remainder is our format string. Falls back to `"%s"`.
 */
function translateFormat(raw: unknown): { format: string; precision?: number } {
	const value = str(raw);
	if (value === "") return { format: "%s" };

	const sep = value.indexOf(":");
	if (sep > 0) {
		const left = value.slice(0, sep);
		const right = value.slice(sep + 1).trim();
		const dot = left.indexOf(".");
		if (dot >= 0 && /^[0-9.]+$/.test(left)) {
			const decimals = left.length - dot - 1;
			return { format: right === "" ? "%s" : right, precision: decimals };
		}
	}
	// No decimal pattern — treat the whole thing as a format string if it has a
	// token, otherwise fall back.
	return { format: value.includes("%") ? value : "%s" };
}

interface Mapped {
	uuid: string;
	settings: Json;
}

/**
 * Map one PilotsDeck action's `settingsModel` to an xp_streamdeck action.
 * Returns null for actions that should pass through unchanged (native folder
 * navigation).
 */
function mapPilotsDeckAction(
	pdUuid: string,
	model: Json,
	ctx: { report: Report; manifest: string; coord: string },
): Mapped {
	const addr = (field: string) => nativeOrClear(model[field], { ...ctx, field });

	if (pdUuid === `${PD_PREFIX}action.switch.korry`) {
		const command = addr("AddressAction");
		const lamp = addr("AddressBot") || addr("AddressMonitor");
		ctx.report.korryNotes.push({
			manifest: ctx.manifest,
			coord: ctx.coord,
			kind: "korry",
			detail: "lamp image overlay not reproduced (mapped to dataref-toggle / command)",
		});
		if (lamp !== "") {
			ctx.report.toggle += 1;
			return {
				uuid: `${OUR_PLUGIN_UUID}.dataref-toggle`,
				settings: {
					datarefPath: lamp,
					stateDataRefPath: lamp,
					commandPath: command,
					triggerMode: "command",
				},
			};
		}
		ctx.report.command += 1;
		return {
			uuid: `${OUR_PLUGIN_UUID}.command`,
			settings: { commandPath: command, hideConfirmation: true },
		};
	}

	if (pdUuid === `${PD_PREFIX}action.display.gauge`) {
		const dataref = addr("Address");
		const { format, precision } = translateFormat(model.Format);
		ctx.report.gaugeDowngrades.push({
			manifest: ctx.manifest,
			coord: ctx.coord,
			kind: "gauge",
			detail: "graphical bar/arc downgraded to text readout",
		});
		ctx.report.display += 1;
		const settings: Json = { datarefPath: dataref, format };
		if (precision !== undefined) settings.precision = precision;
		return { uuid: `${OUR_PLUGIN_UUID}.dataref-display`, settings };
	}

	// Default family: `action.switch` (and any other unhandled pilotsdeck.* that
	// still carries an AddressAction).
	if (pdUuid === `${PD_PREFIX}action.switch`) {
		const command = addr("AddressAction");
		const monitor = addr("AddressMonitor");
		const isToggle = monitor !== "" || model.ToggleSwitch === true;
		if (isToggle) {
			ctx.report.toggle += 1;
			const settings: Json = {
				datarefPath: monitor || command,
				stateDataRefPath: monitor,
				commandPath: command,
				triggerMode: "command",
			};
			const on = str(model.SwitchOnState);
			const off = str(model.SwitchOffState);
			if (on !== "") settings.valueOn = on;
			if (off !== "") settings.valueOff = off;
			return { uuid: `${OUR_PLUGIN_UUID}.dataref-toggle`, settings };
		}
		ctx.report.command += 1;
		return {
			uuid: `${OUR_PLUGIN_UUID}.command`,
			settings: { commandPath: command, hideConfirmation: true },
		};
	}

	// Unknown pilotsdeck action — never silently drop it. Leave a placeholder
	// command so the button keeps its slot, and surface it in the report.
	ctx.report.unknownActions.push({
		manifest: ctx.manifest,
		coord: ctx.coord,
		kind: pdUuid,
		detail: "unrecognized PilotsDeck action → empty command placeholder",
	});
	ctx.report.command += 1;
	return { uuid: `${OUR_PLUGIN_UUID}.command`, settings: { commandPath: "" } };
}

function convertAction(
	action: Json,
	ctx: { report: Report; manifest: string; coord: string },
): void {
	const uuid = str(action.UUID);
	if (uuid.startsWith(NATIVE_PROFILE_PREFIX)) {
		ctx.report.passthrough += 1;
		return; // native folder navigation — leave untouched
	}
	if (!uuid.startsWith(PD_PREFIX)) {
		ctx.report.unknownActions.push({
			manifest: ctx.manifest,
			coord: ctx.coord,
			kind: uuid || "(missing UUID)",
			detail: "non-PilotsDeck, non-native action left untouched",
		});
		return;
	}

	const settings = isObject(action.Settings) ? action.Settings : {};
	const model = isObject(settings.settingsModel) ? settings.settingsModel : settings;
	const mapped = mapPilotsDeckAction(uuid, model, ctx);

	action.UUID = mapped.uuid;
	action.Settings = mapped.settings;
	action.Plugin = {
		Name: OUR_PLUGIN_NAME,
		UUID: OUR_PLUGIN_UUID,
		Version: OUR_PLUGIN_VERSION,
	};
}

/** Rewrite a page manifest (has `Controllers`) in place. */
function convertPageManifest(manifest: Json, name: string, report: Report): void {
	const controllers = Array.isArray(manifest.Controllers) ? manifest.Controllers : [];
	for (const controller of controllers) {
		if (!isObject(controller)) continue;
		const actions = isObject(controller.Actions) ? controller.Actions : {};
		for (const [coord, action] of Object.entries(actions)) {
			if (!isObject(action)) continue;
			report.buttons += 1;
			convertAction(action, { report, manifest: name, coord });
		}
	}
}

/** Neutralize the top-level manifest (has `Device`) so it imports anywhere. */
function neutralizeTopManifest(manifest: Json): void {
	if (isObject(manifest.Device)) {
		manifest.Device.UUID = NEUTRAL_DEVICE_UUID;
	}
	if (isObject(manifest.Pages)) {
		manifest.Pages.Current = NEUTRAL_PAGE_UUID;
	}
	// PilotsDeck-specific keys — drop so the app does not re-associate the
	// profile with the PilotsDeck plugin.
	delete manifest.InstalledByPluginUUID;
	delete manifest.PreconfiguredName;
}

function printReport(report: Report, outPath: string): void {
	const line = (label: string, n: number) => console.log(`  ${label.padEnd(28)} ${n}`);
	console.log("\nPilotsDeck → xp_streamdeck conversion\n");
	line("Pages", report.pages);
	line("Buttons", report.buttons);
	line("  → command", report.command);
	line("  → dataref-toggle", report.toggle);
	line("  → dataref-display", report.display);
	line("  → passthrough (native)", report.passthrough);

	const dumpWarnings = (title: string, ws: Warning[]) => {
		if (ws.length === 0) return;
		console.log(`\n${title} (${ws.length}):`);
		for (const w of ws) {
			console.log(`  [${w.coord}] ${w.kind}: ${w.detail}`);
		}
	};

	dumpWarnings("⚠ Cleared non-native addresses (manual rework needed)", report.clearedAddresses);
	dumpWarnings("⚠ Gauges downgraded to text", report.gaugeDowngrades);
	dumpWarnings("⚠ Korry buttons (lamp overlay lost)", report.korryNotes);
	dumpWarnings("⚠ Unknown actions", report.unknownActions);

	console.log(`\n✓ Wrote ${outPath}\n`);
}

function main(): void {
	const [, , inputArg, outputArg] = process.argv;
	if (!inputArg) {
		console.error(
			"Usage: npx tsx scripts/convert-pilotsdeck.ts <input.streamDeckProfile> [output.streamDeckProfile]",
		);
		process.exit(2);
	}

	const inputPath = inputArg;
	const outputPath =
		outputArg ??
		join(
			dirname(inputPath),
			`${basename(inputPath).replace(/\.streamDeckProfile$/i, "")}.converted.streamDeckProfile`,
		);

	const zip = unzipSync(new Uint8Array(readFileSync(inputPath)));

	const report: Report = {
		pages: 0,
		buttons: 0,
		passthrough: 0,
		command: 0,
		toggle: 0,
		display: 0,
		clearedAddresses: [],
		gaugeDowngrades: [],
		korryNotes: [],
		unknownActions: [],
	};

	const decoder = new TextDecoder();
	const encoder = new TextEncoder();

	for (const [path, bytes] of Object.entries(zip)) {
		if (!path.endsWith("manifest.json")) continue; // skip .bak, images, etc.

		let manifest: Json;
		try {
			manifest = JSON.parse(decoder.decode(bytes)) as Json;
		} catch {
			continue; // not JSON we can parse — leave the original bytes in place
		}

		if (Array.isArray(manifest.Controllers)) {
			report.pages += 1;
			convertPageManifest(manifest, path, report);
		} else if (isObject(manifest.Device)) {
			neutralizeTopManifest(manifest);
		} else {
			continue;
		}

		zip[path] = encoder.encode(JSON.stringify(manifest));
	}

	const out = zipSync(zip);
	writeFileSync(outputPath, out);
	printReport(report, outputPath);
}

main();
