import streamDeck from "@elgato/streamdeck";
import type { JsonObject } from "@elgato/utils";

type SelectorGlobalSettings = JsonObject & {
	selectors?: Record<string, number>;
};

type SelectorListener = (changedKeys: ReadonlySet<string>) => void;

class SelectorRegistry {
	private readonly current = new Map<string, number>();
	private readonly listeners = new Set<SelectorListener>();
	private initialized = false;

	async init(): Promise<void> {
		if (this.initialized) return;
		this.initialized = true;
		streamDeck.settings.onDidReceiveGlobalSettings<SelectorGlobalSettings>((ev) => {
			this.absorb(ev.settings.selectors, "remote");
		});
		try {
			const s = await streamDeck.settings.getGlobalSettings<SelectorGlobalSettings>();
			this.absorb(s.selectors, "initial");
		} catch (err) {
			streamDeck.logger.warn("selectors: getGlobalSettings failed", err);
		}
	}

	get(key: string): number | undefined {
		return this.current.get(key);
	}

	snapshot(): ReadonlyMap<string, number> {
		return this.current;
	}

	async set(key: string, value: number): Promise<void> {
		const prev = this.current.get(key);
		if (prev === value) return;
		this.current.set(key, value);
		this.notify(new Set([key]));
		try {
			await streamDeck.settings.setGlobalSettings<SelectorGlobalSettings>({
				selectors: Object.fromEntries(this.current),
			});
		} catch (err) {
			streamDeck.logger.warn(`selectors: setGlobalSettings failed for ${key}`, err);
		}
	}

	watch(listener: SelectorListener): () => void {
		this.listeners.add(listener);
		return () => {
			this.listeners.delete(listener);
		};
	}

	private absorb(next: Record<string, number> | undefined, source: "initial" | "remote"): void {
		const changed = new Set<string>();
		if (next) {
			for (const [k, v] of Object.entries(next)) {
				if (typeof v !== "number" || !Number.isFinite(v)) continue;
				if (this.current.get(k) !== v) {
					this.current.set(k, v);
					changed.add(k);
				}
			}
		}
		for (const k of [...this.current.keys()]) {
			if (!next || !(k in next)) {
				this.current.delete(k);
				changed.add(k);
			}
		}
		if (changed.size === 0) return;
		streamDeck.logger.info(
			`selectors: ${source} update (${[...changed].map((k) => `${k}=${this.current.get(k) ?? "-"}`).join(", ")})`,
		);
		this.notify(changed);
	}

	private notify(changed: ReadonlySet<string>): void {
		for (const l of this.listeners) {
			try {
				l(changed);
			} catch (err) {
				streamDeck.logger.warn("selectors: listener threw", err);
			}
		}
	}
}

export const selectors = new SelectorRegistry();
