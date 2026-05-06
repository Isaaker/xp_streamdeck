import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { catalog } from "./icons/catalog.ts";
import {
	type IconState,
	renderBackgroundIcon,
	renderDisplayIcon,
	renderNudgeIcon,
	renderSimOfflineIcon,
	renderToggleIcon,
} from "./icons/template.ts";

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
	let backgroundCount = 0;

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
		} else {
			const svg = renderBackgroundIcon(def);
			const png = await renderPng(svg, 144);
			await writeFile(resolve(groupDir, `${def.name}.png`), png);
			backgroundCount += 1;
		}
	}

	console.log(
		`Wrote ${toggleCount + displayCount + nudgeCount + backgroundCount} PNGs to ${OUT_DIR} ` +
			`(${toggleCount} toggle states + ${displayCount} displays + ${nudgeCount} nudges + ` +
			`${backgroundCount} backgrounds, grouped into ${ensuredDirs.size} subdirs, all 144×144)`,
	);

	await mkdir(BUNDLE_IMGS_DIR, { recursive: true });
	const offlinePng = await renderPng(renderSimOfflineIcon(), 144);
	const offlinePath = resolve(BUNDLE_IMGS_DIR, "sim_offline.png");
	await writeFile(offlinePath, offlinePng);
	console.log(`Wrote bundle asset: ${offlinePath}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
