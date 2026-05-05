import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// bin/plugin.js sits at <plugin>/bin/plugin.js, so two dirnames up is the
// plugin bundle root (com.robertw.xplane.sdPlugin/). setImage paths are
// resolved relative to that root.
const PLUGIN_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RUNTIME_REL = "imgs/runtime";
const RUNTIME_ABS = path.join(PLUGIN_ROOT, RUNTIME_REL);

const DATA_URL_RE = /^data:image\/(png|jpeg|jpg|svg\+xml|webp|gif);base64,(.+)$/;

function sanitize(id: string): string {
	return id.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function extFor(mime: string): string {
	switch (mime) {
		case "jpeg":
			return "jpg";
		case "svg+xml":
			return "svg";
		default:
			return mime;
	}
}

/**
 * Returns a value usable as the first argument to {@link KeyAction.setImage}.
 * For Data URLs, this writes the bytes to `imgs/runtime/` and returns the
 * relative path; for plain file paths or undefined, the input is passed
 * through. Stream Deck has been observed to drop Data URL images on
 * multi-state actions, so passing a real path is more reliable.
 */
export async function persistImage(
	actionId: string,
	key: string,
	value: string | undefined,
): Promise<string | undefined> {
	if (!value) return undefined;
	if (!value.startsWith("data:")) return value;
	const m = value.match(DATA_URL_RE);
	if (!m) return undefined;
	const ext = extFor(m[1]);
	const filename = `${sanitize(actionId)}-${sanitize(key)}.${ext}`;
	const rel = `${RUNTIME_REL}/${filename}`;
	const abs = path.join(RUNTIME_ABS, filename);
	await fs.mkdir(RUNTIME_ABS, { recursive: true });
	await fs.writeFile(abs, Buffer.from(m[2], "base64"));
	return rel;
}
