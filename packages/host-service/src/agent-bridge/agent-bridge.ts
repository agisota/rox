import type { UiCommandResult } from "@rox/agent-bridge/commands";
import type { ContextPacket } from "@rox/agent-bridge/context";

export interface StoredScreenContext {
	packet: ContextPacket;
	receivedAt: number;
}

interface PendingCommand {
	resolve: (result: UiCommandResult) => void;
	timer: ReturnType<typeof setTimeout>;
}

/**
 * In-memory agent-bridge state for this host-service process.
 *
 * - Last-known screen context per workspace, published by the renderer on
 *   route/selection changes and read back by MCP `rox_get_screen_context`.
 * - Pending UI commands awaiting a renderer ack, keyed by envelope
 *   `requestId`. `sendUiCommand` registers a waiter before broadcasting and
 *   resolves when the renderer acks (or the timeout fires).
 *
 * Deliberately not persisted: screen context is ephemeral by nature and
 * must die with the renderer/host session.
 */
export class AgentBridgeRegistry {
	private readonly contexts = new Map<string, StoredScreenContext>();
	private readonly pending = new Map<string, PendingCommand>();

	setContext(packet: ContextPacket): void {
		this.contexts.set(packet.workspaceId, {
			packet,
			receivedAt: Date.now(),
		});
	}

	getContext(workspaceId: string): StoredScreenContext | null {
		return this.contexts.get(workspaceId) ?? null;
	}

	clearContext(workspaceId: string): void {
		this.contexts.delete(workspaceId);
	}

	/**
	 * Register a waiter for a UI command ack. Resolves with the renderer's
	 * result, or `{ ok: false, error: "...timed out..." }` after `timeoutMs`.
	 */
	waitForAck(requestId: string, timeoutMs: number): Promise<UiCommandResult> {
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				this.pending.delete(requestId);
				resolve({
					ok: false,
					error: `timed out after ${timeoutMs}ms waiting for renderer ack (is the workspace open in the app?)`,
				});
			}, timeoutMs);
			this.pending.set(requestId, { resolve, timer });
		});
	}

	/** Resolve a pending command. Returns false for unknown/expired ids. */
	resolveAck(requestId: string, result: UiCommandResult): boolean {
		const entry = this.pending.get(requestId);
		if (!entry) return false;
		clearTimeout(entry.timer);
		this.pending.delete(requestId);
		entry.resolve(result);
		return true;
	}

	close(): void {
		for (const [requestId, entry] of this.pending) {
			clearTimeout(entry.timer);
			entry.resolve({ ok: false, error: "host-service shutting down" });
			this.pending.delete(requestId);
		}
		this.contexts.clear();
	}
}
