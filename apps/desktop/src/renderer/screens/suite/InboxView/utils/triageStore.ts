import type { InboxTriageState } from "../types";

/**
 * Pure reducer + persistence helpers for the local inbox triage store
 * (archive / snooze). This is the MVP stand-in for the future per-user
 * `inbox.archive` / `inbox.snooze` backend tables: state lives in
 * `localStorage` so it survives reloads on one machine. Kept React-free and
 * pure so the transitions are unit-testable.
 */

const STORAGE_KEY = "rox.inbox.triage.v1";

export const EMPTY_TRIAGE: InboxTriageState = { archived: {}, snoozed: {} };

/** Snooze presets (label + offset resolver), surfaced in the snooze popover. */
export const SNOOZE_PRESETS: ReadonlyArray<{
	id: string;
	label: string;
	resolve: (now: number) => number;
}> = [
	{ id: "1h", label: "Через час", resolve: (now) => now + 60 * 60_000 },
	{
		id: "evening",
		label: "Сегодня вечером",
		resolve: (now) => atHour(now, 18),
	},
	{ id: "tomorrow", label: "Завтра", resolve: (now) => atHour(now + DAY, 9) },
	{ id: "week", label: "Через неделю", resolve: (now) => now + 7 * DAY },
];

const DAY = 24 * 60 * 60_000;

/** Next occurrence of `hour:00` local time at/after `from`. */
function atHour(from: number, hour: number): number {
	const d = new Date(from);
	d.setHours(hour, 0, 0, 0);
	const t = d.getTime();
	return t > from ? t : t + DAY;
}

/** Archive a row (idempotent). Also clears any snooze on the same key. */
export function archiveItem(
	state: InboxTriageState,
	key: string,
): InboxTriageState {
	const snoozed = { ...state.snoozed };
	delete snoozed[key];
	return { archived: { ...state.archived, [key]: true }, snoozed };
}

/** Restore a row from archive (idempotent) — backs the Undo toast. */
export function unarchiveItem(
	state: InboxTriageState,
	key: string,
): InboxTriageState {
	const archived = { ...state.archived };
	delete archived[key];
	return { ...state, archived };
}

/** Snooze a row until `until` (epoch ms). Removes it from any archive. */
export function snoozeItem(
	state: InboxTriageState,
	key: string,
	until: number,
): InboxTriageState {
	const archived = { ...state.archived };
	delete archived[key];
	return { archived, snoozed: { ...state.snoozed, [key]: { until } } };
}

/** Wake a row from snooze (idempotent). */
export function unsnoozeItem(
	state: InboxTriageState,
	key: string,
): InboxTriageState {
	const snoozed = { ...state.snoozed };
	delete snoozed[key];
	return { ...state, snoozed };
}

/** True if the row is archived. */
export function isArchived(state: InboxTriageState, key: string): boolean {
	return state.archived[key] === true;
}

/** True if the row is currently snoozed (wake time still in the future). */
export function isSnoozed(
	state: InboxTriageState,
	key: string,
	now: number,
): boolean {
	const entry = state.snoozed[key];
	return entry !== undefined && entry.until > now;
}

/** Load persisted triage state (safe on a cold / corrupt store). */
export function loadTriage(): InboxTriageState {
	if (typeof window === "undefined") return EMPTY_TRIAGE;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return EMPTY_TRIAGE;
		const parsed = JSON.parse(raw) as Partial<InboxTriageState>;
		return {
			archived: parsed.archived ?? {},
			snoozed: parsed.snoozed ?? {},
		};
	} catch {
		return EMPTY_TRIAGE;
	}
}

/** Persist triage state (best-effort; never throws into render). */
export function saveTriage(state: InboxTriageState): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Quota / private-mode — triage simply does not persist this session.
	}
}
