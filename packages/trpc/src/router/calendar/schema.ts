import {
	calAttendeeStatusValues,
	calReminderChannelValues,
	calShareRoleValues,
} from "@rox/db/schema";
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

/**
 * Read a bare RRULE body's parts case-insensitively (`FREQ=…;INTERVAL=…`). The
 * router still does the authoritative `RRule.fromString` parse once dtstart and
 * timezone are known; this only enforces the cadence policy that doesn't depend
 * on either.
 */
function rruleParts(body: string): Record<string, string> {
	const parts: Record<string, string> = {};
	for (const segment of body.split(";")) {
		const eq = segment.indexOf("=");
		if (eq <= 0) continue;
		const key = segment.slice(0, eq).trim().toUpperCase();
		const value = segment
			.slice(eq + 1)
			.trim()
			.toUpperCase();
		if (key) parts[key] = value;
	}
	return parts;
}

/**
 * Cadence guardrail shared by every write that accepts an RRULE. Sub-daily
 * recurrences expand to thousands of instances and would silently truncate at
 * the occurrence cap, so:
 *   - `SECONDLY`/`MINUTELY` are rejected outright (too fine to ever expand), and
 *   - `HOURLY`-and-finer must be bounded by `UNTIL` or `COUNT`.
 * Engine validity (`FREQ=BOGUS`, malformed `UNTIL`, …) is checked in the router
 * via `isValidRrule`, where the row's dtstart + timezone are available.
 */
export function isAllowedCadence(body: string): boolean {
	const parts = rruleParts(body);
	const freq = parts.FREQ;
	if (!freq) return true; // engine parse in the router rejects a missing FREQ.
	if (freq === "SECONDLY" || freq === "MINUTELY") return false;
	if (freq === "HOURLY")
		return parts.UNTIL !== undefined || parts.COUNT !== undefined;
	return true;
}

/** RU message used for both the zod refinement and the import-path guard. */
export const RRULE_CADENCE_MESSAGE =
	"Слишком частое повторение: SECONDLY/MINUTELY запрещены, а HOURLY требует UNTIL или COUNT";

// A bare RRULE body (no `RRULE:` prefix); the engine validates full semantics in
// the router, this only length-bounds the string and caps sub-daily cadence.
const rruleBody = z
	.string()
	.min(3)
	.max(1024)
	.refine(isAllowedCadence, { message: RRULE_CADENCE_MESSAGE });

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
	// C8: a rox `@handle` resolved server-side to the owning userId via
	// `user_profiles.handle`. The optional leading `@` is stripped before lookup.
	z.object({
		kind: z.literal("handle"),
		handle: z
			.string()
			.min(1)
			.max(64)
			.transform((h) => h.trim().replace(/^@/, "").toLowerCase()),
	}),
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

/**
 * Hard cap on VEVENTs accepted from a single .ics import. A 2M-char file can
 * still encode thousands of events; the router rejects past this and chunks the
 * insert so one upload can't issue an unbounded statement.
 */
export const MAX_IMPORT_EVENTS = 500;

/** Insert batch size for chunked .ics imports. */
export const IMPORT_INSERT_CHUNK = 100;

/** Per-event EXDATE cap mirrored from `createEventSchema` for .ics imports. */
export const MAX_IMPORT_EXDATES = 500;

// ---- reminders (C6) -------------------------------------------------------

/** Max lead time for a relative reminder: 28 days (40320 minutes). */
export const MAX_REMINDER_OFFSET_MINUTES = 40_320;

/** Max reminders a single user may set on one event (anti-spam guard). */
export const MAX_REMINDERS_PER_EVENT = 10;

const reminderOffset = z
	.number()
	.int()
	.min(0)
	.max(MAX_REMINDER_OFFSET_MINUTES)
	.nullish();
const reminderChannel = z.enum(calReminderChannelValues);
const reminderTrigger = z.enum(["relative", "absolute"]);

/**
 * A reminder is relative (fires `offsetMinutes` before the occurrence) XOR
 * absolute (fires at `absoluteFireAt`). The superRefine enforces that exactly
 * the field matching `trigger` is set, with RU messages matching the file tone.
 */
function refineReminderTrigger(
	v: {
		trigger?: "relative" | "absolute";
		offsetMinutes?: number | null;
		absoluteFireAt?: Date | null;
	},
	ctx: z.RefinementCtx,
): void {
	if (v.trigger === undefined) return; // update with no trigger change.
	if (v.trigger === "relative") {
		if (v.offsetMinutes === null || v.offsetMinutes === undefined) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"Для относительного напоминания укажите offsetMinutes (минуты до начала)",
				path: ["offsetMinutes"],
			});
		}
		if (v.absoluteFireAt !== null && v.absoluteFireAt !== undefined) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"Относительное напоминание не может иметь absoluteFireAt — задайте только offsetMinutes",
				path: ["absoluteFireAt"],
			});
		}
	} else {
		if (v.absoluteFireAt === null || v.absoluteFireAt === undefined) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "Для абсолютного напоминания укажите absoluteFireAt",
				path: ["absoluteFireAt"],
			});
		}
		if (v.offsetMinutes !== null && v.offsetMinutes !== undefined) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"Абсолютное напоминание не может иметь offsetMinutes — задайте только absoluteFireAt",
				path: ["offsetMinutes"],
			});
		}
	}
}

export const createReminderSchema = z
	.object({
		eventId: z.string().uuid(),
		channel: reminderChannel.default("in_app"),
		trigger: reminderTrigger,
		offsetMinutes: reminderOffset,
		absoluteFireAt: z.coerce.date().nullish(),
	})
	.superRefine(refineReminderTrigger);

export const updateReminderSchema = z
	.object({
		reminderId: z.string().uuid(),
		channel: reminderChannel.optional(),
		trigger: reminderTrigger.optional(),
		offsetMinutes: reminderOffset,
		absoluteFireAt: z.coerce.date().nullish(),
	})
	.superRefine(refineReminderTrigger);

export const deleteReminderSchema = z.object({
	reminderId: z.string().uuid(),
});

export const listRemindersSchema = z.object({
	eventId: z.string().uuid(),
});
