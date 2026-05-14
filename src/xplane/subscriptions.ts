import type { DataRefCallback, DataRefValue, SubscriptionHandle, XPlaneLogger } from "./types.js";

export interface SubscriptionTransport {
	resolveDataRefId(name: string): Promise<number>;
	sendSubscribe(id: number): void;
	sendUnsubscribe(id: number): void;
	isConnected(): boolean;
	readonly logger: XPlaneLogger;
}

interface Entry {
	name: string;
	id: number;
	subscribed: boolean;
	pairs: Set<HandlePair>;
}

interface HandlePair {
	handle: HandleImpl;
	callback: DataRefCallback;
}

class HandleImpl implements SubscriptionHandle {
	disposed = false;
	constructor(
		public name: string,
		public id: number,
	) {}
}

export class SubscriptionMultiplexer {
	private byName = new Map<string, Entry>();
	private byId = new Map<number, Entry>();
	private inflight = new Map<string, Promise<Entry>>();

	constructor(private readonly transport: SubscriptionTransport) {}

	async subscribe(name: string, callback: DataRefCallback): Promise<SubscriptionHandle> {
		let entry = this.byName.get(name);
		if (!entry) {
			// Coalesce parallel resolves for the same name so two callers don't each
			// create their own Entry and race-overwrite byName/byId. Without this,
			// two buttons subscribing to the same DataRef end up with one of them
			// orphaned and never receiving deliver() fanouts.
			let pending = this.inflight.get(name);
			if (!pending) {
				pending = (async () => {
					try {
						const id = await this.transport.resolveDataRefId(name);
						const existing = this.byName.get(name);
						if (existing) return existing;
						const created: Entry = { name, id, subscribed: false, pairs: new Set() };
						this.byName.set(name, created);
						this.byId.set(id, created);
						return created;
					} finally {
						this.inflight.delete(name);
					}
				})();
				this.inflight.set(name, pending);
			}
			entry = await pending;
		}
		const handle = new HandleImpl(entry.name, entry.id);
		entry.pairs.add({ handle, callback });

		if (!entry.subscribed && this.transport.isConnected()) {
			this.transport.sendSubscribe(entry.id);
			entry.subscribed = true;
		}
		return handle;
	}

	unsubscribe(handle: SubscriptionHandle): void {
		if (!(handle instanceof HandleImpl) || handle.disposed) return;
		const entry = this.byName.get(handle.name);
		if (!entry) return;

		for (const pair of entry.pairs) {
			if (pair.handle === handle) {
				entry.pairs.delete(pair);
				break;
			}
		}
		handle.disposed = true;

		if (entry.pairs.size === 0) {
			if (entry.subscribed && this.transport.isConnected()) {
				this.transport.sendUnsubscribe(entry.id);
			}
			this.byName.delete(entry.name);
			this.byId.delete(entry.id);
		}
	}

	deliver(id: number, value: DataRefValue): void {
		const entry = this.byId.get(id);
		if (!entry) return;
		for (const { callback } of entry.pairs) {
			try {
				callback(value);
			} catch (err) {
				this.transport.logger.warn(`subscription callback for ${entry.name} threw`, err);
			}
		}
	}

	markAllUnsubscribed(): void {
		for (const entry of this.byName.values()) {
			entry.subscribed = false;
		}
	}

	async rebindAll(): Promise<void> {
		for (const entry of [...this.byName.values()]) {
			try {
				const newId = await this.transport.resolveDataRefId(entry.name);
				if (newId !== entry.id) {
					this.byId.delete(entry.id);
					entry.id = newId;
					this.byId.set(newId, entry);
					for (const { handle } of entry.pairs) {
						handle.id = newId;
					}
				}
				this.transport.sendSubscribe(entry.id);
				entry.subscribed = true;
			} catch (err) {
				this.transport.logger.warn(`re-subscribe failed for ${entry.name}`, err);
			}
		}
	}

	activeNames(): string[] {
		return [...this.byName.keys()];
	}
}
