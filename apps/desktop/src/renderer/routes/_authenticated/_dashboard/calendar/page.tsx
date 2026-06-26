import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { CalendarView } from "renderer/screens/suite/CalendarView";
import {
	type CalendarSearch,
	calendarSearchSchema,
	resolveCalendarSearch,
} from "renderer/screens/suite/CalendarView/utils/searchParams";

export const Route = createFileRoute("/_authenticated/_dashboard/calendar/")({
	component: CalendarPage,
	// #538: persist view/anchor/calendars in the URL so the Calendar's navigation
	// survives reload + the router Back button. `validateSearch` runs the zod
	// schema, which defaults/repairs invalid params instead of throwing; the
	// params stay optional so a plain `<Link to="/calendar">` is still valid.
	validateSearch: (search): CalendarSearch =>
		calendarSearchSchema.parse(search),
});

function CalendarPage() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const resolved = resolveCalendarSearch(search);

	// Merge a partial change onto the current URL, keeping the other params
	// intact (mirrors the Tasks `buildSearch` + `navigate` pattern).
	const onSearchChange = useCallback(
		(partial: Partial<CalendarSearch>) => {
			navigate({
				to: "/calendar",
				search: (prev) => ({ ...prev, ...partial }),
				replace: true,
			});
		},
		[navigate],
	);

	return (
		<CalendarView
			view={resolved.view}
			anchorParam={resolved.anchor}
			calendarIds={resolved.calendars}
			onSearchChange={onSearchChange}
		/>
	);
}
