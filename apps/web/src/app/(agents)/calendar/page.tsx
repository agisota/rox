import { AgentsHeader } from "../components/AgentsHeader";
import { getAgentsUiAccess } from "../utils/getAgentsUiAccess";
import { CalendarScreen } from "./components/CalendarScreen";

/**
 * Calendar — the org calendar web surface (D6 Calendar, P2).
 *
 * Month + agenda views over expanded RRULE occurrences (`calendar.listOccurrences`),
 * a create/edit dialog with recurrence + attendees, and per-attendee RSVP. Gated
 * by the same agents-UI access flag as the rest of the `(agents)` cabinet.
 */
export default async function CalendarPage() {
	const { hasAgentsUiAccess } = await getAgentsUiAccess();

	return (
		<>
			{hasAgentsUiAccess && <AgentsHeader />}
			<CalendarScreen />
		</>
	);
}
