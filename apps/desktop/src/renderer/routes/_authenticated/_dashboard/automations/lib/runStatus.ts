import type { SelectAutomationRun } from "@rox/db/schema";

/**
 * Shared run-status vocabulary for the Automations surface so the sidebar
 * "Предыдущие запуски" list and the full Run Drawer never diverge on colors,
 * labels or which statuses count as success/failure/pending.
 */

export type RunStatusKind = "success" | "failure" | "pending";

export function statusKindOf(
	status: SelectAutomationRun["status"],
): RunStatusKind {
	if (status === "dispatched") return "success";
	if (status === "dispatch_failed" || status === "skipped_offline")
		return "failure";
	return "pending";
}

/** Tailwind dot color per raw status. */
export const RUN_STATUS_DOT: Record<SelectAutomationRun["status"], string> = {
	dispatched: "bg-emerald-500",
	dispatching: "bg-amber-500",
	skipped_offline: "bg-red-500",
	dispatch_failed: "bg-red-500",
};

/** RU label per raw status. */
export const RUN_STATUS_LABEL: Record<SelectAutomationRun["status"], string> = {
	dispatched: "Запущено",
	dispatching: "Запускается",
	skipped_offline: "Хост офлайн",
	dispatch_failed: "Сбой запуска",
};

/** Drawer filter buckets keyed off RunStatusKind (+ "all"). */
export type RunFilter = "all" | "success" | "failure" | "pending";

export const RUN_FILTER_LABEL: Record<RunFilter, string> = {
	all: "Все",
	success: "Успех",
	failure: "Ошибка",
	pending: "В процессе",
};

export function matchesFilter(
	status: SelectAutomationRun["status"],
	filter: RunFilter,
): boolean {
	if (filter === "all") return true;
	return statusKindOf(status) === filter;
}

/**
 * Trigger provenance for a run. The backend does not persist an explicit
 * trigger column yet, so we infer: a run whose `scheduledFor` lands within a
 * couple of seconds of its `createdAt` was almost certainly a manual
 * "Запустить сейчас" (runNow stamps `scheduledFor = new Date()`), whereas a
 * scheduled tick is bucketed to the minute ahead of creation. This is a
 * display-only heuristic; event triggers are a P1 schema addition.
 */
export type RunTrigger = "schedule" | "manual";

export function inferTrigger(run: {
	scheduledFor: Date | string | null;
	createdAt: Date | string | null;
}): RunTrigger {
	if (!run.scheduledFor || !run.createdAt) return "schedule";
	const scheduled = new Date(run.scheduledFor).getTime();
	const created = new Date(run.createdAt).getTime();
	if (!Number.isFinite(scheduled) || !Number.isFinite(created))
		return "schedule";
	return Math.abs(created - scheduled) <= 5000 ? "manual" : "schedule";
}

export const RUN_TRIGGER_LABEL: Record<RunTrigger, string> = {
	schedule: "Расписание",
	manual: "Вручную",
};
