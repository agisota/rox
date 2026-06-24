import { useSyncExternalStore } from "react";
import type { MailDraft } from "../components/MailComposer";

/**
 * Local, typed mail-organization store (folder placement + flags + drafts).
 *
 * WHY THIS EXISTS — the `mail_threads` row has NO folder / flag / direction /
 * draft columns yet (see `mail.ts` recon gaps #1, #2, #6). So the capabilities a
 * full client needs but the server cannot yet persist — archive / trash / spam
 * placement, the star (⭐) flag, and saved drafts — are modeled here against a
 * realistic, durable shape (localStorage, mirroring the inbox `triageStore`).
 *
 * Every read/write below is the EXACT seam a server mutation replaces. When the
 * backend lands the columns + mutations, swap the `set*` calls for tRPC
 * `mail.archive` / `mail.trash` / `mail.setSpam` / `mail.setFlag` / `mail.saveDraft`
 * and the `useMail*` selectors for a server-derived field on `MailThreadSummary`.
 * The UI above never changes — it already treats these as first-class state.
 *
 * TODO(server): replace this whole module with server-backed folder/flag/draft
 * columns + mutations once `mail.*` exposes them. Tracked against recon gaps 1/2/6.
 */

const STORAGE_KEY = "rox.mail.store.v1";

/** Where a thread has been filed by the user (absent ⇒ it lives in Входящие). */
export type MailPlacement = "archive" | "trash" | "spam";

/** A draft saved from the composer, keyed by a stable local id. */
export interface SavedDraft extends MailDraft {
	id: string;
	/** Thread this draft replies to, if any (for re-opening in context). */
	threadId: string | null;
	updatedAt: number;
}

interface MailStoreShape {
	/** threadId → folder placement (only non-inbox placements are stored). */
	placement: Record<string, MailPlacement>;
	/** threadId → starred. Only `true` entries are kept (absent ⇒ not starred). */
	flagged: Record<string, true>;
	/** Locally-persisted drafts, newest-first by `updatedAt` at read time. */
	drafts: SavedDraft[];
}

const EMPTY: MailStoreShape = { placement: {}, flagged: {}, drafts: [] };

function read(): MailStoreShape {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return EMPTY;
		const parsed = JSON.parse(raw) as Partial<MailStoreShape>;
		return {
			placement: parsed.placement ?? {},
			flagged: parsed.flagged ?? {},
			drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
		};
	} catch {
		return EMPTY;
	}
}

// In-memory snapshot so `useSyncExternalStore` returns a STABLE reference between
// writes (re-parsing localStorage every render would loop the store). It is the
// single source of truth after the first read; writes mutate it then persist.
let snapshot: MailStoreShape = read();
const listeners = new Set<() => void>();

function commit(next: MailStoreShape) {
	snapshot = next;
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	} catch {
		// Persistence is best-effort; the in-memory snapshot still drives the UI.
	}
	for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function getSnapshot(): MailStoreShape {
	return snapshot;
}

// ---- Mutations (each is a 1:1 server-mutation seam) -----------------------

/** File a thread into archive/trash/spam. TODO(server): `mail.move`. */
export function setPlacement(threadId: string, placement: MailPlacement): void {
	commit({
		...snapshot,
		placement: { ...snapshot.placement, [threadId]: placement },
	});
}

/** Return a thread to Входящие (clear its placement). TODO(server): `mail.move`. */
export function clearPlacement(threadId: string): void {
	if (!(threadId in snapshot.placement)) return;
	const next = { ...snapshot.placement };
	delete next[threadId];
	commit({ ...snapshot, placement: next });
}

/** Toggle the star flag on a thread. TODO(server): `mail.setFlag`. */
export function toggleFlag(threadId: string): void {
	const next = { ...snapshot.flagged };
	if (next[threadId]) delete next[threadId];
	else next[threadId] = true;
	commit({ ...snapshot, flagged: next });
}

/** Persist (insert-or-update) a draft. TODO(server): `mail.saveDraft`. */
export function upsertDraft(draft: SavedDraft): void {
	const rest = snapshot.drafts.filter((d) => d.id !== draft.id);
	commit({ ...snapshot, drafts: [{ ...draft }, ...rest] });
}

/** Delete a saved draft. TODO(server): `mail.deleteDraft`. */
export function deleteDraft(id: string): void {
	const next = snapshot.drafts.filter((d) => d.id !== id);
	if (next.length === snapshot.drafts.length) return;
	commit({ ...snapshot, drafts: next });
}

// ---- Selectors (hooks) ----------------------------------------------------

/** Live placement map. */
export function useMailPlacements(): Record<string, MailPlacement> {
	return useSyncExternalStore(subscribe, getSnapshot).placement;
}

/** Live starred-thread map. */
export function useMailFlags(): Record<string, true> {
	return useSyncExternalStore(subscribe, getSnapshot).flagged;
}

/** Live drafts, sorted newest-first. */
export function useMailDrafts(): SavedDraft[] {
	const drafts = useSyncExternalStore(subscribe, getSnapshot).drafts;
	return [...drafts].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** A stable local draft id. */
export function newDraftId(): string {
	return `draft_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
