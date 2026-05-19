import { execFileSync } from "node:child_process";
import { copyFile, mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import { resolveSlug, suggestSlugFromPath } from "./profiles/auto-mapper.ts";
import { findBinding } from "./profiles/bindings.ts";

const ROOT = process.cwd();
const PROFILES_DIR = resolve(ROOT, process.env.PROFILES_DIR ?? "streamdeck-profiles");
const ICONS_DIR = resolve(ROOT, process.env.ICONS_DIR ?? "out/icons");
const WORK_DIR = resolve(ROOT, "out/profiles-work");

const XP_PLUGIN_PREFIX = "com.robertw.xplane.";
const BACKGROUND_UUID = "com.robertw.xplane.background";

type Slot = {
	profile: string;
	page: string;
	pageDir: string;
	position: string;
	uuid: string;
	settings: Record<string, unknown>;
	stateImages: Array<{ index: number; relativePath: string }>;
};

type Report = {
	profilesTouched: number;
	imagesReplaced: number;
	autoMapped: number;
	viaBindings: number;
	unboundSlots: Array<{
		profile: string;
		page: string;
		position: string;
		uuid: string;
		settings: Record<string, unknown>;
	}>;
	missingIcons: Array<{ slug: string; profile: string; position: string }>;
	missingStateImage: Array<{ profile: string; position: string; stateIndex: number }>;
};

async function listProfiles(): Promise<string[]> {
	const entries = await readdir(PROFILES_DIR);
	return entries
		.filter((n) => n.endsWith(".streamDeckProfile"))
		.map((n) => resolve(PROFILES_DIR, n))
		.sort();
}

async function unzipProfile(profilePath: string): Promise<string> {
	const name = basename(profilePath, ".streamDeckProfile");
	const dest = resolve(WORK_DIR, name);
	await rm(dest, { recursive: true, force: true });
	await mkdir(dest, { recursive: true });
	execFileSync("unzip", ["-q", profilePath, "-d", dest], { stdio: "inherit" });
	return dest;
}

async function rezipProfile(workDir: string, profilePath: string): Promise<void> {
	// `zip -X` strips extra file attributes (timestamps etc. still get rewritten
	// by zip, but the archive metadata stays minimal). `-r` recurses.
	await rm(profilePath, { force: true });
	execFileSync("zip", ["-q", "-X", "-r", profilePath, "."], {
		cwd: workDir,
		stdio: "inherit",
	});
}

async function findManifests(workDir: string): Promise<string[]> {
	const out: string[] = [];
	const walk = async (dir: string): Promise<void> => {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const e of entries) {
			const full = resolve(dir, e.name);
			if (e.isDirectory()) {
				await walk(full);
			} else if (e.isFile() && e.name === "manifest.json") {
				out.push(full);
			}
		}
	};
	await walk(workDir);
	// Top-level package.json sits at workDir/package.json; only the per-page
	// manifests (under Profiles/*/Profiles/*/manifest.json) carry button slots.
	return out.filter((p) => p.includes("/Profiles/"));
}

async function collectSlots(workDir: string, profileName: string): Promise<Slot[]> {
	const slots: Slot[] = [];
	const manifests = await findManifests(workDir);
	for (const mf of manifests) {
		const raw = await readFile(mf, "utf8");
		const data = JSON.parse(raw);
		const controllers = Array.isArray(data?.Controllers) ? data.Controllers : [];
		const pageDir = dirname(mf);
		const pageId = basename(pageDir);
		for (const ctrl of controllers) {
			const actions = (ctrl?.Actions ?? {}) as Record<string, unknown>;
			for (const [position, actionRaw] of Object.entries(actions)) {
				const action = actionRaw as Record<string, unknown>;
				const uuid = typeof action?.UUID === "string" ? action.UUID : "";
				if (!uuid.startsWith(XP_PLUGIN_PREFIX)) continue;
				if (uuid === BACKGROUND_UUID) continue;
				const settings = (action?.Settings ?? {}) as Record<string, unknown>;
				const statesRaw = Array.isArray(action?.States) ? action.States : [];
				const stateImages: Slot["stateImages"] = [];
				statesRaw.forEach((s, i) => {
					const img = (s as Record<string, unknown>)?.Image;
					if (typeof img === "string" && img.length > 0) {
						stateImages.push({ index: i, relativePath: img });
					}
				});
				slots.push({
					profile: profileName,
					page: pageId,
					pageDir,
					position,
					uuid,
					settings,
					stateImages,
				});
			}
		}
	}
	return slots;
}

function fingerprintKey(uuid: string, settings: Record<string, unknown>): string {
	const keep: Record<string, unknown> = {};
	for (const k of ["datarefPath", "commandPath", "title"]) {
		if (k in settings) keep[k] = settings[k];
	}
	return `${uuid}|${JSON.stringify(keep, Object.keys(keep).sort())}`;
}

async function inspectMode(): Promise<void> {
	const profiles = await listProfiles();
	const fingerprints = new Map<
		string,
		{ count: number; uuid: string; settings: Record<string, unknown> }
	>();

	for (const profilePath of profiles) {
		const workDir = await unzipProfile(profilePath);
		const name = basename(profilePath, ".streamDeckProfile");
		const slots = await collectSlots(workDir, name);
		for (const s of slots) {
			const key = fingerprintKey(s.uuid, s.settings);
			const existing = fingerprints.get(key);
			if (existing) {
				existing.count += 1;
			} else {
				const keep: Record<string, unknown> = {};
				for (const k of ["datarefPath", "commandPath", "title"]) {
					if (k in s.settings) keep[k] = s.settings[k];
				}
				fingerprints.set(key, { count: 1, uuid: s.uuid, settings: keep });
			}
		}
	}

	const sorted = [...fingerprints.values()].sort((a, b) => {
		if (a.uuid !== b.uuid) return a.uuid.localeCompare(b.uuid);
		return b.count - a.count;
	});

	console.log(`// ${sorted.length} unique fingerprints across ${profiles.length} profiles.`);
	console.log("// Paste into scripts/profiles/bindings.ts and fill in `icons`.");
	console.log("// State index 0 = first state; toggles use 0=off, 1=on by convention.");
	console.log("");
	for (const f of sorted) {
		const matchEntries = Object.entries(f.settings)
			.map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
			.join(", ");
		console.log("{");
		console.log(`\tuuid: ${JSON.stringify(f.uuid)},`);
		console.log(`\tmatch: { ${matchEntries} },`);
		console.log(`\ticons: { 0: "REPLACE/me" }, // x${f.count}`);
		console.log("},");
	}
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

async function applyMode(): Promise<Report> {
	const profiles = await listProfiles();
	const report: Report = {
		profilesTouched: 0,
		imagesReplaced: 0,
		autoMapped: 0,
		viaBindings: 0,
		unboundSlots: [],
		missingIcons: [],
		missingStateImage: [],
	};

	for (const profilePath of profiles) {
		const profileName = basename(profilePath, ".streamDeckProfile");
		const workDir = await unzipProfile(profilePath);
		const slots = await collectSlots(workDir, profileName);

		let perProfileReplaced = 0;

		for (const slot of slots) {
			// Try the auto-mapper first; fall back to explicit BINDINGS overrides.
			let icons = resolveSlug(slot.uuid, slot.settings);
			let source: "auto" | "binding" = "auto";
			if (!icons) {
				const override = findBinding(slot.uuid, slot.settings);
				if (override) {
					icons = override.icons;
					source = "binding";
				}
			}
			if (!icons) {
				report.unboundSlots.push({
					profile: profileName,
					page: slot.page,
					position: slot.position,
					uuid: slot.uuid,
					settings: slot.settings,
				});
				continue;
			}
			if (source === "auto") report.autoMapped += 1;
			else report.viaBindings += 1;
			for (const [stateIndexStr, slug] of Object.entries(icons)) {
				const stateIndex = Number(stateIndexStr);
				const stateImg = slot.stateImages.find((s) => s.index === stateIndex);
				if (!stateImg) {
					report.missingStateImage.push({
						profile: profileName,
						position: `${slot.page}/${slot.position}`,
						stateIndex,
					});
					continue;
				}
				const srcPng = resolve(ICONS_DIR, `${slug}.png`);
				if (!(await fileExists(srcPng))) {
					report.missingIcons.push({
						slug,
						profile: profileName,
						position: `${slot.page}/${slot.position}`,
					});
					continue;
				}
				const destPng = resolve(slot.pageDir, stateImg.relativePath);
				await copyFile(srcPng, destPng);
				perProfileReplaced += 1;
			}
		}

		if (perProfileReplaced > 0) {
			await rezipProfile(workDir, profilePath);
			report.imagesReplaced += perProfileReplaced;
			report.profilesTouched += 1;
			console.log(`  ${profileName}: ${perProfileReplaced} images replaced`);
		} else {
			console.log(`  ${profileName}: 0 replacements (skipped rezip)`);
		}
	}

	return report;
}

async function listIconSlugs(): Promise<string[]> {
	const slugs: string[] = [];
	const walk = async (dir: string, prefix: string): Promise<void> => {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const e of entries) {
			const full = resolve(dir, e.name);
			if (e.isDirectory()) {
				await walk(full, prefix ? `${prefix}/${e.name}` : e.name);
			} else if (e.isFile() && e.name.endsWith(".png")) {
				const stem = e.name.replace(/\.png$/, "");
				slugs.push(prefix ? `${prefix}/${stem}` : stem);
			}
		}
	};
	try {
		await walk(ICONS_DIR, "");
	} catch {
		// ICONS_DIR missing — leave list empty
	}
	return slugs;
}

async function suggestMode(): Promise<void> {
	const profiles = await listProfiles();
	const availableSlugs = await listIconSlugs();
	const seen = new Map<
		string,
		{ uuid: string; settings: Record<string, unknown>; count: number }
	>();

	for (const profilePath of profiles) {
		const profileName = basename(profilePath, ".streamDeckProfile");
		const workDir = await unzipProfile(profilePath);
		const slots = await collectSlots(workDir, profileName);
		for (const slot of slots) {
			if (resolveSlug(slot.uuid, slot.settings)) continue;
			if (findBinding(slot.uuid, slot.settings)) continue;
			const fp = fingerprintKey(slot.uuid, slot.settings);
			const existing = seen.get(fp);
			if (existing) existing.count += 1;
			else seen.set(fp, { uuid: slot.uuid, settings: slot.settings, count: 1 });
		}
	}

	const entries = [...seen.values()].sort((a, b) => {
		if (a.uuid !== b.uuid) return a.uuid.localeCompare(b.uuid);
		return b.count - a.count;
	});

	console.log(`// ${entries.length} unbound fingerprints. Paste matching ones into`);
	console.log("// scripts/profiles/auto-mapper.ts DIRECT[] (or bindings.ts BINDINGS[]).");
	console.log("// Each entry shows a heuristic slug guess where one was found in out/icons/.");
	console.log("");
	for (const e of entries) {
		const cmd = typeof e.settings.commandPath === "string" ? e.settings.commandPath : "";
		const drf = typeof e.settings.datarefPath === "string" ? e.settings.datarefPath : "";
		const guess =
			suggestSlugFromPath(cmd, availableSlugs) ||
			suggestSlugFromPath(drf, availableSlugs) ||
			"REPLACE/me";
		const matchEntries = Object.entries(e.settings)
			.filter(
				([_, v]) =>
					typeof v === "string" || typeof v === "number" || typeof v === "boolean",
			)
			.map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
			.join(", ");
		console.log("{");
		console.log(`\tuuid: ${JSON.stringify(e.uuid)},`);
		console.log(`\tmatch: { ${matchEntries} },`);
		console.log(`\tslugs: { 0: ${JSON.stringify(guess)} }, // x${e.count}`);
		console.log("},");
	}
}

function printReport(report: Report): boolean {
	console.log("");
	console.log("=== Report ===");
	console.log(`Profiles touched:    ${report.profilesTouched}`);
	console.log(`Images replaced:     ${report.imagesReplaced}`);
	console.log(`Auto-mapped slots:   ${report.autoMapped}`);
	console.log(`Via bindings:        ${report.viaBindings}`);
	console.log(`Unbound slots:       ${report.unboundSlots.length}`);
	console.log(`Missing icons:       ${report.missingIcons.length}`);
	console.log(`Missing state imgs:  ${report.missingStateImage.length}`);

	if (report.missingIcons.length > 0) {
		console.log("");
		console.log("Missing icon files (slug → out/icons/<slug>.png):");
		const uniqueSlugs = new Map<string, number>();
		for (const m of report.missingIcons) {
			uniqueSlugs.set(m.slug, (uniqueSlugs.get(m.slug) ?? 0) + 1);
		}
		for (const [slug, count] of [...uniqueSlugs].sort()) {
			console.log(`  ${slug}  (used ${count}x)`);
		}
	}

	if (report.unboundSlots.length > 0) {
		console.log("");
		console.log(
			`Unbound slots (no rule in auto-mapper or BINDINGS): ${report.unboundSlots.length}`,
		);
		console.log("  Run `make profile-suggest` to dump TS-ready entries with slug guesses.");
	}

	// missingStateImage is a *warning*, not a fail: the slot's manifest has no
	// Image path for that state (the user never dropped a PNG onto that state
	// in the Stream Deck app). Nothing to replace, but the profile still works.
	const ok = report.missingIcons.length === 0 && report.unboundSlots.length === 0;
	return ok;
}

async function main(): Promise<void> {
	await mkdir(WORK_DIR, { recursive: true });

	if (process.argv.includes("--inspect")) {
		await inspectMode();
		return;
	}

	if (process.argv.includes("--suggest")) {
		await suggestMode();
		return;
	}

	console.log("Updating profiles via auto-mapper + bindings overrides…");
	console.log(`  Source icons:  ${relative(ROOT, ICONS_DIR)}/`);
	console.log(`  Profiles dir:  ${relative(ROOT, PROFILES_DIR)}/`);
	console.log("");

	const report = await applyMode();
	const ok = printReport(report);
	if (!ok) {
		console.log("");
		console.log("Exit non-zero: mappings or icons incomplete.");
		process.exit(1);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
