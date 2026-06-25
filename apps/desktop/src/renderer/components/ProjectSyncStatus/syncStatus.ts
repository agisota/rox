/**
 * Pure presentation model for the local-first sync indicator (#537).
 *
 * Phase 1 (#482) creates projects/workspaces locally and links the cloud record
 * in the background via the `sync_outbox` worker; each local row carries a
 * `syncState` (`pending` | `synced` | `error`). This module maps that raw state
 * (plus the live online/offline signal) onto exactly what the badge should show,
 * with NO React or Electron dependency so it is trivially unit-testable and
 * reusable by web/mobile shells that read the same `syncState` from their own
 * transport.
 *
 * Rules (from the issue's acceptance):
 *   - `pending` while ONLINE  → "Синхронизация…" (work is saved, catching up).
 *   - `pending`/`error` while OFFLINE → non-alarming "Офлайн — синхронизируется
 *     при подключении" (the create is safe locally; it'll drain on reconnect).
 *   - `error` while ONLINE → non-alarming "Повтор синхронизации" (the worker
 *     retries with backoff; never a scary failure).
 *   - `synced` → hidden (`visible: false`); nothing to nag about.
 *
 * The indicator is purely informational — the entity is fully usable while
 * `pending`, so nothing here gates interaction.
 */

/**
 * Local-first sync state of an entity's cloud mirror, mirroring the host-service
 * `EntitySyncState` column. Declared locally (not imported from
 * `@rox/host-service`) so this renderer-side presentation module stays free of
 * any node/bun DB module and is portable to web/mobile shells verbatim.
 */
export type EntitySyncState = "pending" | "synced" | "error";

/** Visual severity, mapped to a Badge variant by the component. */
export type SyncStatusTone = "muted" | "warning" | "hidden";

export interface SyncStatusView {
	/** Whether to render anything at all (synced → false). */
	visible: boolean;
	/** Stable discriminator for the icon + test assertions. */
	kind: "syncing" | "offline" | "retrying" | "synced";
	/** RU label shown next to the icon (empty when hidden). */
	label: string;
	/** Severity for styling; `hidden` when not visible. */
	tone: SyncStatusTone;
}

const SYNCED_VIEW: SyncStatusView = {
	visible: false,
	kind: "synced",
	label: "",
	tone: "hidden",
};

/**
 * Resolve the badge view for a local-first entity. `online` defaults to `true`
 * so a caller without a network signal still gets the sensible "syncing…" copy
 * rather than implying offline.
 */
export function resolveSyncStatus(args: {
	syncState: EntitySyncState;
	online?: boolean;
}): SyncStatusView {
	const { syncState, online = true } = args;

	if (syncState === "synced") return SYNCED_VIEW;

	// Offline dominates: whether pending or error, the honest message is that the
	// work is held locally and will sync once connectivity returns.
	if (!online) {
		return {
			visible: true,
			kind: "offline",
			label: "Офлайн — синхронизируется при подключении",
			tone: "warning",
		};
	}

	if (syncState === "error") {
		return {
			visible: true,
			kind: "retrying",
			label: "Повтор синхронизации",
			tone: "warning",
		};
	}

	// pending + online
	return {
		visible: true,
		kind: "syncing",
		label: "Синхронизация…",
		tone: "muted",
	};
}
