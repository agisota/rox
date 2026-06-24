import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { type JournalSearch, JournalSurface } from "./JournalSurface";

const TABS = ["feed", "reflection"] as const;
const KINDS = ["all", "automation_run", "ambient_nudge"] as const;
const STATUSES = ["all", "success", "error", "skipped", "info"] as const;

/**
 * Journal route. URL-search holds the active tab + feed filters so the journal
 * is linkable and survives reloads (tasks/layout pattern). All values are
 * validated/narrowed; unknown values fall through to `undefined` (defaults).
 */
export const Route = createFileRoute("/_authenticated/_dashboard/journal/")({
	component: JournalPage,
	validateSearch: (raw: Record<string, unknown>): JournalSearch => ({
		tab: TABS.includes(raw.tab as (typeof TABS)[number])
			? (raw.tab as JournalSearch["tab"])
			: undefined,
		kind: KINDS.includes(raw.kind as (typeof KINDS)[number])
			? (raw.kind as JournalSearch["kind"])
			: undefined,
		status: STATUSES.includes(raw.status as (typeof STATUSES)[number])
			? (raw.status as JournalSearch["status"])
			: undefined,
		q: typeof raw.q === "string" && raw.q.length > 0 ? raw.q : undefined,
	}),
});

function JournalPage() {
	const search = Route.useSearch();
	const navigate = useNavigate();

	const onSearchChange = useCallback(
		(patch: Partial<JournalSearch>) => {
			void navigate({
				to: "/journal",
				// Reducer must return exactly the journal route's search shape.
				// `prev` is the router-wide search union (its `tab` is widened by
				// sibling routes); narrow back to `JournalSearch` and only carry
				// the journal keys so we never leak a wider `tab` than JournalTab.
				search: (prev): JournalSearch => {
					const current = prev as JournalSearch;
					return {
						tab: current.tab,
						kind: current.kind,
						status: current.status,
						q: current.q,
						...patch,
					};
				},
				replace: true,
			});
		},
		[navigate],
	);

	return <JournalSurface search={search} onSearchChange={onSearchChange} />;
}
