import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { catalog } from "./icons/catalog.ts";
import { type IconState, renderDisplayIcon, renderToggleIcon } from "./icons/template.ts";

const OUT_DIR = resolve(process.cwd(), "out/icons");
const STATES: IconState[] = ["on", "off"];

async function renderPng(svg: string, size: number): Promise<Buffer> {
	return sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
}

async function main(): Promise<void> {
	await mkdir(OUT_DIR, { recursive: true });

	let toggleCount = 0;
	let displayCount = 0;

	for (const def of catalog) {
		if (def.kind === "toggle") {
			for (const state of STATES) {
				const svg = renderToggleIcon(def, state);
				const png = await renderPng(svg, 144);
				await writeFile(resolve(OUT_DIR, `${def.name}_${state}.png`), png);
				toggleCount += 1;
			}
		} else {
			const svg = renderDisplayIcon(def);
			const png = await renderPng(svg, 144);
			await writeFile(resolve(OUT_DIR, `${def.name}.png`), png);
			displayCount += 1;
		}
	}

	console.log(
		`Wrote ${toggleCount + displayCount} PNGs to ${OUT_DIR} ` +
			`(${toggleCount} toggle states + ${displayCount} display headers, all 144×144)`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
