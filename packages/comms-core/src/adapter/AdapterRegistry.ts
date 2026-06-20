/**
 * Registry of {@link TransportAdapter}s keyed by {@link CommsTransport}.
 *
 * The router asks the registry for the adapter that speaks a given transport
 * when sending; inbound webhooks pick the adapter for the source transport to
 * normalize. One adapter per transport.
 */

import type { CommsTransport } from "../types";
import type { TransportAdapter } from "./TransportAdapter";

export class AdapterRegistry {
	private readonly adapters = new Map<CommsTransport, TransportAdapter>();

	constructor(initial: ReadonlyArray<TransportAdapter> = []) {
		for (const adapter of initial) {
			this.register(adapter);
		}
	}

	/** Register (or replace) the adapter for its transport. */
	register(adapter: TransportAdapter): this {
		this.adapters.set(adapter.kind, adapter);
		return this;
	}

	/** Whether an adapter is registered for the transport. */
	has(kind: CommsTransport): boolean {
		return this.adapters.has(kind);
	}

	/** Get the adapter for a transport, or `undefined` if none is registered. */
	get(kind: CommsTransport): TransportAdapter | undefined {
		return this.adapters.get(kind);
	}

	/** Get the adapter for a transport, throwing if none is registered. */
	require(kind: CommsTransport): TransportAdapter {
		const adapter = this.adapters.get(kind);
		if (!adapter) {
			throw new Error(`No transport adapter registered for "${kind}"`);
		}
		return adapter;
	}

	/** Transports that currently have a registered adapter. */
	kinds(): CommsTransport[] {
		return [...this.adapters.keys()];
	}
}
