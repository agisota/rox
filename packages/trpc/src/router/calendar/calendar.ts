/**
 * Calendar tRPC router — D6 Calendar (comms-suite epic, P2).
 *
 * Org-scoped calendars + RRULE-recurring events with attendees + RSVP, plus an
 * occurrence-range query that expands recurrences on read (no materialized
 * instances) and .ics import/export. Every procedure is org-scoped via
 * `requireActiveOrgMembership` (the comms/drive pattern) and constrains all
 * statements by `organizationId`.
 *
 * Access model: a calendar is readable/writable by its owner plus anyone in
 * `cal_calendar_shares`. {@link resolveCalendarAccess} computes the caller's
 * effective role before any read or write so a share-less member cannot reach a
 * calendar that merely lives in their org.
 *
 * Calendar invite EMAIL is deferred to P3; P2 ships in-app attendees + .ics.
 */

import { db, dbWs } from "@rox/db/client";
import {
	calCalendarShares,
	calCalendars,
	calEventAttendees,
	calEvents,
} from "@rox/db/schema";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgMembership } from "../utils/active-org";
import { exportIcs, type IcsEvent, importIcs } from "./ics";
import { type ExpandableEvent, expandEvents } from "./occurrences";
import {
	addAttendeeSchema,
	createCalendarSchema,
	createEventSchema,
	deleteCalendarSchema,
	deleteEventSchema,
	exportIcsSchema,
	getEventSchema,
	importIcsSchema,
	listOccurrencesSchema,
	removeAttendeeSchema,
	rsvpSchema,
	shareCalendarSchema,
	unshareCalendarSchema,
	updateCalendarSchema,
	updateEventSchema,
} from "./schema";

type CalRole = "reader" | "writer" | "owner";

/** Rank roles so a writer check accepts owners too. */
const ROLE_RANK: Record<CalRole, number> = { reader: 0, writer: 1, owner: 2 };

/**
 * Resolve the caller's effective role on a calendar (owner > share-grant), or
 * throw 404 (not in org) / 403 (no grant). `min` is the required capability.
 */
async function resolveCalendarAccess(
	organizationId: string,
	userId: string,
	calendarId: string,
	min: CalRole,
): Promise<{ calendar: typeof calCalendars.$inferSelect; role: CalRole }> {
	const [calendar] = await db
		.select()
		.from(calCalendars)
		.where(
			and(
				eq(calCalendars.id, calendarId),
				eq(calCalendars.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!calendar) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Calendar not found" });
	}

	let role: CalRole | null = calendar.ownerUserId === userId ? "owner" : null;
	if (!role) {
		const [share] = await db
			.select({ role: calCalendarShares.role })
			.from(calCalendarShares)
			.where(
				and(
					eq(calCalendarShares.calendarId, calendarId),
					eq(calCalendarShares.userId, userId),
				),
			)
			.limit(1);
		if (share) role = share.role as CalRole;
	}

	if (!role || ROLE_RANK[role] < ROLE_RANK[min]) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Insufficient calendar access",
		});
	}
	return { calendar, role };
}

/** Calendar ids the caller can read in the org (owned + shared). */
async function readableCalendarIds(
	organizationId: string,
	userId: string,
): Promise<string[]> {
	const owned = await db
		.select({ id: calCalendars.id })
		.from(calCalendars)
		.where(
			and(
				eq(calCalendars.organizationId, organizationId),
				eq(calCalendars.ownerUserId, userId),
			),
		);
	const shared = await db
		.select({ id: calCalendarShares.calendarId })
		.from(calCalendarShares)
		.where(
			and(
				eq(calCalendarShares.organizationId, organizationId),
				eq(calCalendarShares.userId, userId),
			),
		);
	return Array.from(new Set([...owned, ...shared].map((r) => r.id)));
}

/** Confirm an event belongs to the org and return it + its calendar access. */
async function getEventWithAccess(
	organizationId: string,
	userId: string,
	eventId: string,
	min: CalRole,
) {
	const [event] = await db
		.select()
		.from(calEvents)
		.where(
			and(
				eq(calEvents.id, eventId),
				eq(calEvents.organizationId, organizationId),
			),
		)
		.limit(1);
	if (!event) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
	}
	await resolveCalendarAccess(organizationId, userId, event.calendarId, min);
	return event;
}

function toExpandable(event: typeof calEvents.$inferSelect): ExpandableEvent {
	return {
		id: event.id,
		dtstart: event.dtstart,
		dtend: event.dtend,
		timezone: event.timezone,
		rrule: event.rrule,
		exdates: event.exdates,
	};
}

export const calendarRouter = {
	// ---- calendars --------------------------------------------------------
	listCalendars: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		const userId = ctx.session.user.id;
		const ids = await readableCalendarIds(organizationId, userId);
		if (ids.length === 0) return [];
		return db
			.select()
			.from(calCalendars)
			.where(
				and(
					eq(calCalendars.organizationId, organizationId),
					inArray(calCalendars.id, ids),
				),
			)
			.orderBy(asc(calCalendars.name));
	}),

	createCalendar: protectedProcedure
		.input(createCalendarSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const [row] = await db
				.insert(calCalendars)
				.values({
					organizationId,
					ownerUserId: ctx.session.user.id,
					name: input.name,
					color: input.color ?? null,
					timezone: input.timezone ?? "UTC",
				})
				.returning();
			return row;
		}),

	updateCalendar: protectedProcedure
		.input(updateCalendarSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await resolveCalendarAccess(
				organizationId,
				ctx.session.user.id,
				input.calendarId,
				"writer",
			);
			const [row] = await db
				.update(calCalendars)
				.set({
					...(input.name !== undefined ? { name: input.name } : {}),
					...(input.color !== undefined ? { color: input.color } : {}),
					...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
				})
				.where(
					and(
						eq(calCalendars.id, input.calendarId),
						eq(calCalendars.organizationId, organizationId),
					),
				)
				.returning();
			return row;
		}),

	deleteCalendar: protectedProcedure
		.input(deleteCalendarSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			// Only the owner may delete a calendar.
			await resolveCalendarAccess(
				organizationId,
				ctx.session.user.id,
				input.calendarId,
				"owner",
			);
			await db
				.delete(calCalendars)
				.where(
					and(
						eq(calCalendars.id, input.calendarId),
						eq(calCalendars.organizationId, organizationId),
					),
				);
			return { ok: true as const };
		}),

	// ---- sharing (ACL) ----------------------------------------------------
	shareCalendar: protectedProcedure
		.input(shareCalendarSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await resolveCalendarAccess(
				organizationId,
				ctx.session.user.id,
				input.calendarId,
				"owner",
			);
			const [row] = await db
				.insert(calCalendarShares)
				.values({
					organizationId,
					calendarId: input.calendarId,
					userId: input.userId,
					role: input.role,
				})
				.onConflictDoUpdate({
					target: [calCalendarShares.calendarId, calCalendarShares.userId],
					set: { role: input.role },
				})
				.returning();
			return row;
		}),

	unshareCalendar: protectedProcedure
		.input(unshareCalendarSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await resolveCalendarAccess(
				organizationId,
				ctx.session.user.id,
				input.calendarId,
				"owner",
			);
			await db
				.delete(calCalendarShares)
				.where(
					and(
						eq(calCalendarShares.calendarId, input.calendarId),
						eq(calCalendarShares.userId, input.userId),
					),
				);
			return { ok: true as const };
		}),

	listShares: protectedProcedure
		.input(deleteCalendarSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await resolveCalendarAccess(
				organizationId,
				ctx.session.user.id,
				input.calendarId,
				"reader",
			);
			return db
				.select()
				.from(calCalendarShares)
				.where(eq(calCalendarShares.calendarId, input.calendarId));
		}),

	// ---- events -----------------------------------------------------------
	getEvent: protectedProcedure
		.input(getEventSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const event = await getEventWithAccess(
				organizationId,
				ctx.session.user.id,
				input.eventId,
				"reader",
			);
			const attendees = await db
				.select()
				.from(calEventAttendees)
				.where(eq(calEventAttendees.eventId, event.id));
			return { event, attendees };
		}),

	createEvent: protectedProcedure
		.input(createEventSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			await resolveCalendarAccess(
				organizationId,
				userId,
				input.calendarId,
				"writer",
			);

			return dbWs.transaction(async (tx) => {
				const [event] = await tx
					.insert(calEvents)
					.values({
						organizationId,
						calendarId: input.calendarId,
						createdByUserId: userId,
						title: input.title,
						description: input.description ?? null,
						location: input.location ?? null,
						dtstart: input.dtstart,
						dtend: input.dtend,
						allDay: input.allDay ?? false,
						timezone: input.timezone ?? "UTC",
						rrule: input.rrule ?? null,
						exdates: (input.exdates ?? []).map((d) => d.toISOString()),
					})
					.returning();
				if (!event) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create event",
					});
				}

				// Organizer is always an accepted attendee.
				const rows = [
					{
						organizationId,
						eventId: event.id,
						userId,
						email: null,
						status: "accepted" as const,
						isOrganizer: true,
					},
					...(input.attendees ?? [])
						.filter((a) => !(a.kind === "userId" && a.userId === userId))
						.map((a) =>
							a.kind === "userId"
								? {
										organizationId,
										eventId: event.id,
										userId: a.userId,
										email: null,
										status: "needs_action" as const,
										isOrganizer: false,
									}
								: {
										organizationId,
										eventId: event.id,
										userId: null,
										email: a.email,
										status: "needs_action" as const,
										isOrganizer: false,
									},
						),
				];
				await tx.insert(calEventAttendees).values(rows).onConflictDoNothing();

				return event;
			});
		}),

	updateEvent: protectedProcedure
		.input(updateEventSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getEventWithAccess(
				organizationId,
				ctx.session.user.id,
				input.eventId,
				"writer",
			);
			const [row] = await db
				.update(calEvents)
				.set({
					...(input.title !== undefined ? { title: input.title } : {}),
					...(input.description !== undefined
						? { description: input.description }
						: {}),
					...(input.location !== undefined ? { location: input.location } : {}),
					...(input.dtstart !== undefined ? { dtstart: input.dtstart } : {}),
					...(input.dtend !== undefined ? { dtend: input.dtend } : {}),
					...(input.allDay !== undefined ? { allDay: input.allDay } : {}),
					...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
					...(input.rrule !== undefined ? { rrule: input.rrule } : {}),
					...(input.exdates !== undefined
						? { exdates: input.exdates.map((d) => d.toISOString()) }
						: {}),
				})
				.where(
					and(
						eq(calEvents.id, input.eventId),
						eq(calEvents.organizationId, organizationId),
					),
				)
				.returning();
			return row;
		}),

	deleteEvent: protectedProcedure
		.input(deleteEventSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await getEventWithAccess(
				organizationId,
				ctx.session.user.id,
				input.eventId,
				"writer",
			);
			await db
				.delete(calEvents)
				.where(
					and(
						eq(calEvents.id, input.eventId),
						eq(calEvents.organizationId, organizationId),
					),
				);
			return { ok: true as const };
		}),

	// ---- attendees / RSVP -------------------------------------------------
	addAttendee: protectedProcedure
		.input(addAttendeeSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const event = await getEventWithAccess(
				organizationId,
				ctx.session.user.id,
				input.eventId,
				"writer",
			);
			const [row] = await db
				.insert(calEventAttendees)
				.values(
					input.attendee.kind === "userId"
						? {
								organizationId,
								eventId: event.id,
								userId: input.attendee.userId,
								email: null,
								status: "needs_action" as const,
							}
						: {
								organizationId,
								eventId: event.id,
								userId: null,
								email: input.attendee.email,
								status: "needs_action" as const,
							},
				)
				.onConflictDoNothing()
				.returning();
			return row ?? { ok: true as const };
		}),

	removeAttendee: protectedProcedure
		.input(removeAttendeeSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const [attendee] = await db
				.select()
				.from(calEventAttendees)
				.where(
					and(
						eq(calEventAttendees.id, input.attendeeId),
						eq(calEventAttendees.organizationId, organizationId),
					),
				)
				.limit(1);
			if (!attendee) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Attendee not found",
				});
			}
			await getEventWithAccess(
				organizationId,
				ctx.session.user.id,
				attendee.eventId,
				"writer",
			);
			await db
				.delete(calEventAttendees)
				.where(eq(calEventAttendees.id, input.attendeeId));
			return { ok: true as const };
		}),

	/** The caller sets their own RSVP on an event they can read. */
	rsvp: protectedProcedure
		.input(rsvpSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			// Reader access is enough to RSVP to an invite.
			await getEventWithAccess(organizationId, userId, input.eventId, "reader");
			const rows = await db
				.update(calEventAttendees)
				.set({ status: input.status, comment: input.comment ?? null })
				.where(
					and(
						eq(calEventAttendees.eventId, input.eventId),
						eq(calEventAttendees.userId, userId),
					),
				)
				.returning({ id: calEventAttendees.id });
			if (rows.length === 0) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not an attendee of this event",
				});
			}
			return { ok: true as const };
		}),

	// ---- occurrence range query (month / agenda) --------------------------
	listOccurrences: protectedProcedure
		.input(listOccurrencesSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			let calendarIds = await readableCalendarIds(organizationId, userId);
			if (input.calendarIds) {
				const requested = new Set(input.calendarIds);
				calendarIds = calendarIds.filter((id) => requested.has(id));
			}
			if (calendarIds.length === 0) return { occurrences: [], events: [] };

			const events = await db
				.select()
				.from(calEvents)
				.where(
					and(
						eq(calEvents.organizationId, organizationId),
						inArray(calEvents.calendarId, calendarIds),
					),
				);

			const active = events.filter((e) => e.status !== "cancelled");
			const occurrences = expandEvents(
				active.map(toExpandable),
				input.rangeStart,
				input.rangeEnd,
			).map((o) => ({
				eventId: o.eventId,
				start: o.start.toISOString(),
				end: o.end.toISOString(),
			}));

			return { occurrences, events: active };
		}),

	// ---- ICS import / export ---------------------------------------------
	exportIcs: protectedProcedure
		.input(exportIcsSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const { calendar } = await resolveCalendarAccess(
				organizationId,
				ctx.session.user.id,
				input.calendarId,
				"reader",
			);
			const events = await db
				.select()
				.from(calEvents)
				.where(
					and(
						eq(calEvents.organizationId, organizationId),
						eq(calEvents.calendarId, input.calendarId),
					),
				);
			const ics = exportIcs(
				events.map(
					(e): IcsEvent => ({
						uid: `${e.id}@rox.one`,
						title: e.title,
						description: e.description,
						location: e.location,
						dtstart: e.dtstart,
						dtend: e.dtend,
						allDay: e.allDay,
						rrule: e.rrule,
						exdates: e.exdates,
					}),
				),
				calendar.name,
			);
			return { ics, filename: `${calendar.name}.ics` };
		}),

	importIcs: protectedProcedure
		.input(importIcsSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const { calendar } = await resolveCalendarAccess(
				organizationId,
				userId,
				input.calendarId,
				"writer",
			);

			const parsed = importIcs(input.ics);
			if (parsed.length === 0) return { imported: 0 };

			const values = parsed.map((e) => ({
				organizationId,
				calendarId: calendar.id,
				createdByUserId: userId,
				title: e.title,
				description: e.description ?? null,
				location: e.location ?? null,
				dtstart: e.dtstart,
				dtend: e.dtend,
				allDay: e.allDay ?? false,
				timezone: calendar.timezone,
				rrule: e.rrule ?? null,
				exdates: e.exdates ?? [],
			}));
			const rows = await db
				.insert(calEvents)
				.values(values)
				.returning({ id: calEvents.id });
			return { imported: rows.length };
		}),
} satisfies TRPCRouterRecord;
