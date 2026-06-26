import type { FeedKindFilter, FeedStatusFilter } from "./types";

/** RU labels for the event `kind` discriminator (badge text). */
export const KIND_LABELS: Record<string, string> = {
	automation_run: "Автоматизация",
	ambient_nudge: "Подсказка",
};

/** RU labels for the journal-memory-suggestion categories (reflection lane). */
export const CATEGORY_LABELS: Record<string, string> = {
	projects: "Проекты",
	identity: "Личное",
	instructions: "Правила",
	career: "Карьера",
	general: "Общее",
};

/**
 * Status-dot colour per raw discriminator. Extended beyond the legacy map to
 * cover every `automationRunStatus` value (incl. in-flight `dispatching`) plus
 * the synthetic `conflict` / `ambient` markers carried in `payload`.
 */
export const STATUS_DOT: Record<string, string> = {
	dispatching: "bg-sky-500",
	dispatched: "bg-emerald-500",
	dispatch_failed: "bg-red-500",
	skipped_offline: "bg-muted-foreground",
	conflict: "bg-amber-500",
	ambient: "bg-sky-500",
};

/** RU human label per raw discriminator (drill-down detail + a11y). */
export const STATUS_LABELS: Record<string, string> = {
	dispatching: "Выполняется",
	dispatched: "Запущено",
	dispatch_failed: "Ошибка запуска",
	skipped_offline: "Пропущено (оффлайн)",
	conflict: "Конфликт",
	ambient: "Подсказка",
};

/** Dot colour for a status, defaulting to the muted accent for unknowns. */
export function statusDotClass(status: string | undefined): string {
	return (status && STATUS_DOT[status]) ?? "bg-muted-foreground";
}

/** Human label for a status, defaulting to the raw value. */
export function statusLabel(status: string | undefined): string {
	if (!status) return "—";
	return STATUS_LABELS[status] ?? status;
}

/**
 * A status is "live" (worth pulsing) while it is actively dispatching. Recency
 * is handled separately by the row so brand-new rows also pulse briefly.
 */
export function isLiveStatus(status: string | undefined): boolean {
	return status === "dispatching";
}

/** Ordered kind filter chips for the feed filter bar. */
export const KIND_FILTERS: { value: FeedKindFilter; label: string }[] = [
	{ value: "all", label: "Все" },
	{ value: "automation_run", label: "Автоматизация" },
	{ value: "ambient_nudge", label: "Подсказка" },
];

/** Ordered status filter chips for the feed filter bar. */
export const STATUS_FILTERS: { value: FeedStatusFilter; label: string }[] = [
	{ value: "all", label: "Все" },
	{ value: "success", label: "Успех" },
	{ value: "error", label: "Ошибка" },
	{ value: "skipped", label: "Пропущено" },
	{ value: "info", label: "Инфо" },
];
