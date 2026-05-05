import streamDeck, { action, KeyDownEvent, SingletonAction } from "@elgato/streamdeck";

const XPLANE_API_BASE = "http://localhost:8086/api/v3";
const COMMAND_NAME = "sim/operation/pause_toggle";

let cachedCommandId: number | null = null;

async function resolveCommandId(): Promise<number> {
	const url = `${XPLANE_API_BASE}/commands?filter[name]=${encodeURIComponent(COMMAND_NAME)}`;
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`X-Plane resolve failed: HTTP ${res.status}`);
	}
	const body = (await res.json()) as { data?: Array<{ id: number; name: string }> };
	const match = body.data?.find((c) => c.name === COMMAND_NAME) ?? body.data?.[0];
	if (!match || typeof match.id !== "number") {
		throw new Error(`Command not found: ${COMMAND_NAME}`);
	}
	return match.id;
}

async function activateCommand(id: number): Promise<void> {
	const res = await fetch(`${XPLANE_API_BASE}/command/${id}/activate`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ duration: 0 }),
	});
	if (!res.ok) {
		throw new Error(`X-Plane activate failed: HTTP ${res.status}`);
	}
}

@action({ UUID: "com.robertw.xplane.command-pause" })
export class CommandPause extends SingletonAction {
	override async onKeyDown(_ev: KeyDownEvent): Promise<void> {
		try {
			if (cachedCommandId === null) {
				cachedCommandId = await resolveCommandId();
				streamDeck.logger.info(`Resolved ${COMMAND_NAME} -> id=${cachedCommandId}`);
			}
			try {
				await activateCommand(cachedCommandId);
				streamDeck.logger.info(`Activated ${COMMAND_NAME} (id=${cachedCommandId})`);
			} catch (firstErr) {
				streamDeck.logger.warn(`Activate failed, re-resolving id`, firstErr);
				cachedCommandId = await resolveCommandId();
				await activateCommand(cachedCommandId);
				streamDeck.logger.info(`Activated ${COMMAND_NAME} after re-resolve (id=${cachedCommandId})`);
			}
		} catch (err) {
			streamDeck.logger.error(`Pause toggle failed`, err);
		}
	}
}
