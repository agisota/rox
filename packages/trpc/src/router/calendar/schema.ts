import { calAttendeeStatusValues, calShareRoleValues } from "@rox/db/schema";
import { z } from "zod";

/**
 * Zod inputs for the calendar tRPC router (D6, P2).
 *
 * Calendars + RRULE-recurring events, RSVP, range occurrence queries, and .ics
 * import/export. Every procedure is org-scoped at the router; these schemas only
 * validate the request shape. Calendar invite EMAIL is deferred to P3 — P2 is
 * in-app invites + .ics only.
 */

const isoDate = z.coerce.date();
const timezone = z.string().min(1).max(64);
// A bare RRULE body (no `RRULE:` prefix); the engine validates semantics.
const rruleBody = z.string().min(3).max(1024);

// ---- calendars ------------------------------------------------------------

export const createCalendarSchema = z.object({
	name: z.string().min(1).max(200),
	color: z.string().max(32).nullish(),
	timezone: timezone.optional(),
});

export const updateCalendarSchema = z.object({
	calendarId: z.string().uuid(),
	name: z.string().min(1).max(200).optional(),
	color: z.string().max(32).nullish(),
	timezone: timezone.optional(),
});

export const deleteCalendarSchema = z.object({
	calendarId: z.string().uuid(),
});

export const shareCalendarSchema = z.object({
	calendarId: z.string().uuid(),
	userId: z.string().uuid(),
	role: z.enum(calShareRoleValues),
});

export const unshareCalendarSchema = z.object({
	calendarId: z.string().uuid(),
	userId: z.string().uuid(),
});

// ---- events ---------------------------------------------------------------

const attendeeInput = z.union([
	z.object({ kind: z.literal("userId"), userId: z.string().uuid() }),
	z.object({ kind: z.literal("email"), email: z.string().email() }),
]);

export const createEventSchema = z
	.object({
		calendarId: z.string().uuid(),
		title: z.string().min(1).max(500),
		description: z.string().max(20_000).nullish(),
		location: z.string().max(500).nullish(),
		dtstart: isoDate,
		dtend: isoDate,
		allDay: z.boolean().optional(),
		timezone: timezone.optional(),
		rrule: rruleBody.nullish(),
		exdates: z.array(z.coerce.date()).max(500).optional(),
		attendees: z.array(attendeeInput).max(200).optional(),
	})
	.refine((v) => v.dtend.getTime() >= v.dtstart.getTime(), {
		message: "dtend must not be before dtstart",
		path: ["dtend"],
	});

export const updateEventSchema = z
	.object({
		eventId: z.string().uuid(),
		title: z.string().min(1).max(500).optional(),
		description: z.string().max(20_000).nullish(),
		location: z.string().max(500).nullish(),
		dtstart: isoDate.optional(),
		dtend: isoDate.optional(),
		allDay: z.boolean().optional(),
		timezone: timezone.optional(),
		rrule: rruleBody.nullish(),
		exdates: z.array(z.coerce.date()).max(500).optional(),
	})
	.refine(
		(v) =>
			v.dtstart === undefined ||
			v.dtend === undefined ||
			v.dtend.getTime() >= v.dtstart.getTime(),
		{ message: "dtend must not be before dtstart", path: ["dtend"] },
	);

export const deleteEventSchema = z.object({
	eventId: z.string().uuid(),
});

export const getEventSchema = z.object({
	eventId: z.string().uuid(),
});

// ---- attendees / RSVP -----------------------------------------------------

export const addAttendeeSchema = z.object({
	eventId: z.string().uuid(),
	attendee: attendeeInput,
});

export const removeAttendeeSchema = z.object({
	attendeeId: z.string().uuid(),
});

export const rsvpSchema = z.object({
	eventId: z.string().uuid(),
	status: z.enum(calAttendeeStatusValues),
	comment: z.string().max(2000).nullish(),
});

// ---- occurrence queries ---------------------------------------------------

export const listOccurrencesSchema = z
	.object({
		/** Restrict to specific calendars; omit = every calendar the caller can read. */
		calendarIds: z.array(z.string().uuid()).max(100).optional(),
		rangeStart: isoDate,
		rangeEnd: isoDate,
	})
	.refine((v) => v.rangeEnd.getTime() > v.rangeStart.getTime(), {
		message: "rangeEnd must be after rangeStart",
		path: ["rangeEnd"],
	});

// ---- ICS ------------------------------------------------------------------

export const exportIcsSchema = z.object({
	calendarId: z.string().uuid(),
});

export const importIcsSchema = z.object({
	calendarId: z.string().uuid(),
	ics: z.string().min(1).max(2_000_000),
});
