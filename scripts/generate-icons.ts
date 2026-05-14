import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { catalog } from "./icons/catalog.ts";
import {
	ACTION_ICON_NAMES,
	type IconState,
	renderActionGlyph,
	renderBackgroundIcon,
	renderCommandIcon,
	renderDefaultKeyIcon,
	renderDisplayIcon,
	renderGcuKeyIcon,
	renderKnobIcon,
	renderNudgeDisplayIcon,
	renderNudgeIcon,
	renderSimOfflineIcon,
	renderToggleIcon,
	renderToggleStateIcon,
	renderViewIcon,
} from "./icons/template.ts";

// Action UUIDs whose key.png / key@2x.png should be the neutral default
// (subtle blue-framed empty tile) instead of the glyph scaled up. The action
// picker (icon.png) keeps the glyph in all cases.
// `dataref-toggle` is intentionally excluded — its on/off state images take
// over the moment the button is configured.
const NEUTRAL_DEFAULT_KEY_ACTIONS: ReadonlySet<string> = new Set([
	"command",
	"command-display",
	"rotary",
	"dataref-display",
	"dataref-write",
	"multi-dataref-display",
	"wind-display",
]);

const OUT_DIR = resolve(process.cwd(), "out/icons");
// Bundle assets land directly inside the plugin bundle so the runtime can
// reference them via relative path in setImage() (e.g. "imgs/sim_offline").
const BUNDLE_IMGS_DIR = resolve(process.cwd(), "com.robertw.xplane.sdPlugin/imgs");
const STATES: IconState[] = ["on", "off"];

async function renderPng(svg: string, size: number): Promise<Buffer> {
	return sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
}

async function main(): Promise<void> {
	await mkdir(OUT_DIR, { recursive: true });

	const ensuredDirs = new Set<string>();
	const ensureGroupDir = async (group: string): Promise<string> => {
		const dir = resolve(OUT_DIR, group);
		if (!ensuredDirs.has(dir)) {
			await mkdir(dir, { recursive: true });
			ensuredDirs.add(dir);
		}
		return dir;
	};

	let toggleCount = 0;
	let displayCount = 0;
	let nudgeCount = 0;
	let nudgeDisplayCount = 0;
	let commandCount = 0;
	let knobCount = 0;
	let gcuKeyCount = 0;
	let backgroundCount = 0;
	let viewCount = 0;

	for (const def of catalog) {
		const groupDir = await ensureGroupDir(def.group);
		if (def.kind === "toggle") {
			for (const state of STATES) {
				const svg = renderToggleIcon(def, state);
				const png = await renderPng(svg, 144);
				await writeFile(resolve(groupDir, `${def.name}_${state}.png`), png);
				toggleCount += 1;
			}
		} else if (def.kind === "display") {
			const svg = renderDisplayIcon(def);
			const png = await renderPng(svg, 144);
			await writeFile(resolve(groupDir, `${def.name}.png`), png);
			displayCount += 1;
		} else if (def.kind === "nudge") {
			const svg = renderNudgeIcon(def);
			const png = await renderPng(svg, 144);
			await writeFile(resolve(groupDir, `${def.name}.png`), png);
			nudgeCount += 1;
		} else if (def.kind === "nudge-display") {
			const svg = renderNudgeDisplayIcon(def);
			const png = await renderPng(svg, 144);
			await writeFile(resolve(groupDir, `${def.name}.png`), png);
			nudgeDisplayCount += 1;
		} else if (def.kind === "command") {
			const svg = renderCommandIcon(def);
			const png = await renderPng(svg, 144);
			await writeFile(resolve(groupDir, `${def.name}.png`), png);
			commandCount += 1;
		} else if (def.kind === "knob") {
			const svg = renderKnobIcon(def);
			const png = await renderPng(svg, 144);
			await writeFile(resolve(groupDir, `${def.name}.png`), png);
			knobCount += 1;
		} else if (def.kind === "gcu_key") {
			const svg = renderGcuKeyIcon(def);
			const png = await renderPng(svg, 144);
			await writeFile(resolve(groupDir, `${def.name}.png`), png);
			gcuKeyCount += 1;
		} else if (def.kind === "view") {
			const svg = renderViewIcon(def);
			const png = await renderPng(svg, 144);
			await writeFile(resolve(groupDir, `${def.name}.png`), png);
			viewCount += 1;
		} else {
			const svg = renderBackgroundIcon(def);
			const png = await renderPng(svg, 144);
			await writeFile(resolve(groupDir, `${def.name}.png`), png);
			backgroundCount += 1;
		}
	}

	const total =
		toggleCount +
		displayCount +
		nudgeCount +
		nudgeDisplayCount +
		commandCount +
		knobCount +
		gcuKeyCount +
		backgroundCount +
		viewCount;
	console.log(
		`Wrote ${total} PNGs to ${OUT_DIR} ` +
			`(${toggleCount} toggle states + ${displayCount} displays + ${nudgeCount} nudges + ` +
			`${nudgeDisplayCount} nudge-displays + ${commandCount} commands + ${knobCount} knobs + ` +
			`${gcuKeyCount} gcu_keys + ${backgroundCount} backgrounds + ${viewCount} views, ` +
			`grouped into ${ensuredDirs.size} subdirs, all 144×144)`,
	);

	await mkdir(BUNDLE_IMGS_DIR, { recursive: true });
	const offlinePng = await renderPng(renderSimOfflineIcon(), 144);
	const offlinePath = resolve(BUNDLE_IMGS_DIR, "sim_offline.png");
	await writeFile(offlinePath, offlinePng);
	console.log(`Wrote bundle asset: ${offlinePath}`);

	// Action-icons: per-UUID glyphs, written into the plugin bundle so they
	// show up in the Stream Deck library sidebar and as the default key image.
	const ACTION_ICON_SIZES: Array<[string, number]> = [
		["icon.png", 20],
		["icon@2x.png", 40],
		["key.png", 72],
		["key@2x.png", 144],
	];
	const defaultKeySvg = renderDefaultKeyIcon();
	let actionIconCount = 0;
	for (const name of ACTION_ICON_NAMES) {
		const actionDir = resolve(BUNDLE_IMGS_DIR, "actions", name);
		await mkdir(actionDir, { recursive: true });
		const glyphSvg = renderActionGlyph(name);
		const useDefaultKey = NEUTRAL_DEFAULT_KEY_ACTIONS.has(name);
		for (const [filename, size] of ACTION_ICON_SIZES) {
			const isKey = filename.startsWith("key");
			const svg = isKey && useDefaultKey ? defaultKeySvg : glyphSvg;
			const png = await renderPng(svg, size);
			await writeFile(resolve(actionDir, filename), png);
			actionIconCount += 1;
		}
	}
	console.log(
		`Wrote ${actionIconCount} action-icon PNGs across ${ACTION_ICON_NAMES.length} actions`,
	);

	// Toggle state defaults — manifest States[].Image for DataRef Toggle.
	const STATES_DIR = resolve(BUNDLE_IMGS_DIR, "states");
	await mkdir(STATES_DIR, { recursive: true });
	const TOGGLE_STATE_SIZES: Array<[string, number]> = [
		["off.png", 72],
		["off@2x.png", 144],
		["on.png", 72],
		["on@2x.png", 144],
	];
	const toggleSvgs = { off: renderToggleStateIcon("off"), on: renderToggleStateIcon("on") };
	for (const [filename, size] of TOGGLE_STATE_SIZES) {
		const state: IconState = filename.startsWith("off") ? "off" : "on";
		const png = await renderPng(toggleSvgs[state], size);
		await writeFile(resolve(STATES_DIR, filename), png);
	}
	console.log(`Wrote 4 toggle-state PNGs to ${STATES_DIR}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
