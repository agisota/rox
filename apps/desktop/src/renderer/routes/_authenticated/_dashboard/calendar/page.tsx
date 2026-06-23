import { createFileRoute } from "@tanstack/react-router";
import { CalendarView } from "renderer/screens/suite/CalendarView";

export const Route = createFileRoute("/_authenticated/_dashboard/calendar/")({
	component: CalendarPage,
});

function CalendarPage() {
	return <CalendarView />;
}
