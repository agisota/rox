/**
 * Rox Workspace Suite — D6 Calendar (comms-suite epic, P2).
 *
 * Org-scoped calendars and events. An event is a single `cal_events` row that
 * may be one-off or recurring; recurrence is stored as an RFC 5545 RRULE body
 * (`rrule`) anchored at `dtstart` in the event's IANA `timezone`. Occurrence
 * expansion runs through the shared rrule helper (`@rox/shared/rrule`) — the
 * same DST-correct engine the automation scheduler uses — so the calendar never
 * persists materialized instances; it expands a date range on read.
 *
 *   cal_calendars        → a named calendar owned by a user inside an org
 *   cal_events           → one event (one-off or RRULE-recurring) on a calendar
 *   cal_event_attendees  → invitees by rox user OR raw email, with RSVP status
 *   cal_calendar_shares  → ACL: grant another org member reader/writer/owner
 *
 * Design decisions (mirrors the comms-suite conventions in comms.ts/drive.ts):
 *   - Every table carries `organization_id` and indexes are org-leading so a
 *     query that forgets the org filter cannot use the index (multi-tenant
 *     isolation + Electric shape-filtering convention).
 *   - Attendees are a rox user (`user_id`) XOR a raw `email` (external invitee),
 *     enforced by a check constraint — the in-app + .ics invite path in P2,
 *     with the email-send path deferred to P3.
 *   - Calendar access is the owner plus anyone in `cal_calendar_shares`; the
 *     router resolves the effective role before any read/write.
 *
 * Additive only — NEVER hand-edit migrations; change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import { sql } from "drizzle-orm";
import {
	boolean,
	check,
	index,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import {
	calAttendeeStatusValues,
	calEventStatusValues,
	calShareRoleValues,
} from "./enums";

// ---------------------------------------------------------------------------
// pgEnums
// ---------------------------------------------------------------------------

export const calAttendeeStatus = pgEnum(
	"cal_attendee_status",
	calAttendeeStatusValues,
);
export const calShareRole = pgEnum("cal_share_role", calShareRoleValues);
export const calEventStatus = pgEnum("cal_event_status", calEventStatusValues);

/** Free-form per-event metadata (conferencing links, source ICS UID, extras). */
export type CalEventMetadata = Record<string, unknown>;

// ---------------------------------------------------------------------------
// cal_calendars — a named calendar owned by a user inside an org
// ---------------------------------------------------------------------------

export const calCalendars = pgTable(
	"cal_calendars",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		ownerUserId: uuid("owner_user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		name: text().notNull(),
		// Hex color for the UI (e.g. "#6366f1"); rendering-only, never validated here.
		color: text(),
		// Default IANA timezone applied to events that don't override it.
		timezone: text().notNull().default("UTC"),
		// The user's primary calendar (auto-provisioned); not user-deletable.
		isDefault: boolean("is_default").notNull().default(false),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("cal_calendars_org_owner_idx").on(t.organizationId, t.ownerUserId),
	],
);

export type InsertCalCalendar = typeof calCalendars.$inferInsert;
export type SelectCalCalendar = typeof calCalendars.$inferSelect;

// ---------------------------------------------------------------------------
// cal_events — one event (one-off or RRULE-recurring) on a calendar
// ---------------------------------------------------------------------------

export const calEvents = pgTable(
	"cal_events",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		calendarId: uuid("calendar_id")
			.notNull()
			.references(() => calCalendars.id, { onDelete: "cascade" }),
		// The user who created the event (for audit + default organizer attendee).
		createdByUserId: uuid("created_by_user_id").references(() => users.id, {
			onDelete: "set null",
		}),

		title: text().notNull(),
		description: text(),
		location: text(),

		// Anchor instant + duration. For all-day events the time portion is ignored
		// by the UI; `dtstart`/`dtend` are still stored as instants.
		dtstart: timestamp({ withTimezone: true }).notNull(),
		dtend: timestamp({ withTimezone: true }).notNull(),
		allDay: boolean("all_day").notNull().default(false),
		// IANA timezone the recurrence calendar is computed in (DST-correct).
		timezone: text().notNull().default("UTC"),

		// RFC 5545 RRULE body WITHOUT the `RRULE:` prefix (e.g.
		// "FREQ=WEEKLY;BYDAY=MO"). NULL = a single, non-recurring event.
		rrule: text(),
		// Comma-joined RFC 5545 EXDATE instants (UTC ISO) to skip when expanding.
		exdates: jsonb().$type<string[]>().notNull().default([]),

		status: calEventStatus().notNull().default("confirmed"),
		metadata: jsonb().$type<CalEventMetadata>().notNull().default({}),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		// Range scan: a calendar's events overlapping a window, org-leading.
		index("cal_events_org_calendar_dtstart_idx").on(
			t.organizationId,
			t.calendarId,
			t.dtstart,
		),
		index("cal_events_calendar_idx").on(t.calendarId),
		// dtend must not precede dtstart.
		check("cal_events_end_after_start", sql`${t.dtend} >= ${t.dtstart}`),
	],
);

export type InsertCalEvent = typeof calEvents.$inferInsert;
export type SelectCalEvent = typeof calEvents.$inferSelect;

// ---------------------------------------------------------------------------
// cal_event_attendees — invitees by rox user OR raw email, with RSVP status
// ---------------------------------------------------------------------------

export const calEventAttendees = pgTable(
	"cal_event_attendees",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		eventId: uuid("event_id")
			.notNull()
			.references(() => calEvents.id, { onDelete: "cascade" }),

		// A rox user attendee XOR a raw external email (enforced by check below).
		userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
		email: text(),

		status: calAttendeeStatus().notNull().default("needs_action"),
		// The organizer is the attendee who created the event; UI surfaces it and
		// it cannot self-decline out of existence.
		isOrganizer: boolean("is_organizer").notNull().default(false),
		comment: text(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("cal_event_attendees_event_idx").on(t.eventId),
		index("cal_event_attendees_user_idx").on(t.userId),
		// A rox user appears at most once per event (partial: only where user set).
		uniqueIndex("cal_event_attendees_event_user_uniq")
			.on(t.eventId, t.userId)
			.where(sql`${t.userId} IS NOT NULL`),
		// An external email appears at most once per event.
		uniqueIndex("cal_event_attendees_event_email_uniq")
			.on(t.eventId, t.email)
			.where(sql`${t.email} IS NOT NULL`),
		// Exactly one identity: a rox user XOR an email.
		check(
			"cal_event_attendees_one_identity",
			sql`(${t.userId} IS NOT NULL) <> (${t.email} IS NOT NULL)`,
		),
	],
);

export type InsertCalEventAttendee = typeof calEventAttendees.$inferInsert;
export type SelectCalEventAttendee = typeof calEventAttendees.$inferSelect;

// ---------------------------------------------------------------------------
// cal_calendar_shares — ACL: grant another org member access to a calendar
// ---------------------------------------------------------------------------

export const calCalendarShares = pgTable(
	"cal_calendar_shares",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		calendarId: uuid("calendar_id")
			.notNull()
			.references(() => calCalendars.id, { onDelete: "cascade" }),
		// The org member this grant is for.
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		role: calShareRole().notNull().default("reader"),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		// One grant per (calendar, user); upsert the role to change it.
		uniqueIndex("cal_calendar_shares_calendar_user_uniq").on(
			t.calendarId,
			t.userId,
		),
		index("cal_calendar_shares_user_idx").on(t.userId),
		index("cal_calendar_shares_org_idx").on(t.organizationId),
	],
);

export type InsertCalCalendarShare = typeof calCalendarShares.$inferInsert;
export type SelectCalCalendarShare = typeof calCalendarShares.$inferSelect;
