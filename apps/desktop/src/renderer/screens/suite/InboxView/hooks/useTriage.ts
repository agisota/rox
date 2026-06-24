import { toast } from "@rox/ui/sonner";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { InboxTriageState } from "../types";
import {
	archiveItem,
	isArchived,
	isSnoozed,
	loadTriage,
	saveTriage,
	snoozeItem,
	unarchiveItem,
	unsnoozeItem,
} from "../utils/triageStore";

/**
 * Stateful wrapper over the pure {@link InboxTriageState} reducer: holds the
 * triage state, persists every change to `localStorage` (the MVP stand-in for
 * the future `inbox.archive` / `inbox.snooze` backend), and re-renders on a
 * coarse tick so snoozed rows wake back into the active stream on time.
 *
 * Archive/Done emit an Undo toast (`@rox/ui/sonner`) so a mis-triage is one
 * click to reverse — the Inbox-Zero "process to zero, safely" UX.
 */
export interface UseTriageResult {
	state: InboxTriageState;
	isArchived: (key: string) => boolean;
	isSnoozed: (key: string) => boolean;
	/** Archive (or "Done") a row with an Undo toast. */
	archive: (key: string, label?: string) => void;
	/** Snooze a row until `until` (epoch ms) with an Undo toast. */
	snooze: (key: string, until: number) => void;
	/** Wake a snoozed row now. */
	unsnooze: (key: string) => void;
}

/** Re-evaluate snooze expiry on this cadence (cheap; list is small). */
const WAKE_TICK_MS = 30_000;

export function useTriage(): UseTriageResult {
	const [state, setState] = useState<InboxTriageState>(loadTriage);
	const [now, setNow] = useState(() => Date.now());

	// Persist on every change.
	useEffect(() => {
		saveTriage(state);
	}, [state]);

	// Coarse wake tick so snoozed rows return to the stream without a reload.
	useEffect(() => {
		const id = setInterval(() => setNow(Date.now()), WAKE_TICK_MS);
		return () => clearInterval(id);
	}, []);

	const archive = useCallback((key: string, label?: string) => {
		setState((prev) => archiveItem(prev, key));
		toast.success(label ?? "Перемещено в архив", {
			action: {
				label: "Отменить",
				onClick: () => setState((prev) => unarchiveItem(prev, key)),
			},
		});
	}, []);

	const snooze = useCallback((key: string, until: number) => {
		setState((prev) => snoozeItem(prev, key, until));
		toast.success("Отложено", {
			action: {
				label: "Отменить",
				onClick: () => setState((prev) => unsnoozeItem(prev, key)),
			},
		});
	}, []);

	const unsnooze = useCallback((key: string) => {
		setState((prev) => unsnoozeItem(prev, key));
	}, []);

	return useMemo(
		() => ({
			state,
			isArchived: (key: string) => isArchived(state, key),
			isSnoozed: (key: string) => isSnoozed(state, key, now),
			archive,
			snooze,
			unsnooze,
		}),
		[state, now, archive, snooze, unsnooze],
	);
}
