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
	calEventOccurrences,
	calEvents,
	calReminders,
	userProfiles,
} from "@rox/db/schema";
import { isValidRrule } from "@rox/shared/rrule";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { protectedProcedure } from "../../trpc";
import { assertOrgMembers } from "../integration/assertOrgMembers";
import { verifyOrgMembership } from "../integration/utils";
import { requireActiveOrgMembership } from "../utils/active-org";
import { generateFeedToken } from "./feed-token";
import { exportIcs, type IcsEvent, importIcs } from "./ics";
import {
	type ExpandableEvent,
	expandEvents,
	type OccurrenceOverride,
} from "./occurrences";
import { computeNextFireAt } from "./reminders";
import {
	addAttendeeSchema,
	cancelOccurrenceSchema,
	createCalendarSchema,
	createEventSchema,
	createReminderSchema,
	deleteCalendarSchema,
	deleteEventSchema,
	deleteReminderSchema,
	disableCalendarFeedSchema,
	enableCalendarFeedSchema,
	exportIcsSchema,
	getEventSchema,
	IMPORT_INSERT_CHUNK,
	importIcsSchema,
	isAllowedCadence,
	listOccurrencesSchema,
	listRemindersSchema,
	MAX_IMPORT_EVENTS,
	MAX_IMPORT_EXDATES,
	MAX_REMINDERS_PER_EVENT,
	RRULE_CADENCE_MESSAGE,
	removeAttendeeSchema,
	restoreOccurrenceSchema,
	rotateCalendarFeedSchema,
	rsvpSchema,
	shareCalendarSchema,
	unshareCalendarSchema,
	updateCalendarSchema,
	updateEventSchema,
	updateOccurrenceSchema,
	updateReminderSchema,
} from "./schema";

/**
 * Build the public subscribe URL for a feed token. The public route lives in
 * apps/api at `/calendar/feed/<token>` (outside `/api/`, no auth); mirror
 * {@link getPublicShareUrl} by reading `NEXT_PUBLIC_API_URL` (the externally
 * reachable api origin in prod). Exported so callers display the server-built
 * URL rather than reconstructing the origin client-side.
 */
export function getCalendarFeedUrl(token: string): string {
	const origin = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");
	return `${origin}/calendar/feed/${token}`;
}

/**
 * Reject an RRULE body that the occurrence engine can't safely expand: enforce
 * the same sub-daily cadence policy as the zod refinement (the .ics path skips
 * it), then engine-validate against the row's own dtstart + timezone so a
 * malformed body (`FREQ=BOGUS`, bad `UNTIL`, …) never reaches the DB and poisons
 * later reads. Throws `BAD_REQUEST` on rejection.
 */
function assertValidRrule(
	rrule: string,
	dtstart: Date,
	timezone: string,
): void {
	if (!isAllowedCadence(rrule)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: RRULE_CADENCE_MESSAGE,
		});
	}
	if (!isValidRrule(rrule, dtstart, timezone)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Некорректное правило повторения (RRULE)",
		});
	}
}

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

/**
 * #528 helper: compare an incoming `exdates` (Date[]) against the stored value
 * (ISO `string[]`) as instant sets, order-insensitive. Used only to decide
 * whether the timing anchor moved enough to warrant a reminder recompute.
 */
function sameExdates(incoming: Date[], stored: string[]): boolean {
	if (incoming.length !== stored.length) return false;
	const a = new Set(incoming.map((d) => d.getTime()));
	for (const s of stored) {
		if (!a.has(new Date(s).getTime())) return false;
	}
	return true;
}

/**
 * #528: re-materialize `next_fire_at` for every SCHEDULED reminder of an event
 * whose timing anchor (`dtstart` / `rrule` / `timezone`) just changed.
 *
 * `updateReminder` already recomputes on a reminder edit, but a plain
 * `updateEvent` that reschedules the series/one-off left each reminder pointing
 * at its OLD instant (it would keep firing at the stale time until re-saved).
 * For each reminder we re-run the SAME pure {@link computeNextFireAt} the
 * create/update reminder paths use, off the freshly-written event row:
 *   - a future instant → write the new `next_fire_at` (kept `scheduled`);
 *   - `null` (recurrence exhausted / one-off now in the past) → flip to `fired`
 *     so the due-scan stops considering it, mirroring the post-fire terminal
 *     state rather than leaving a `scheduled` row with a stale future key.
 *
 * Only `scheduled` rows are touched — already `fired`/`cancelled` reminders are
 * terminal and must not be silently re-armed by an unrelated event edit.
 */
async function recomputeRemindersForEvent(
	organizationId: string,
	event: typeof calEvents.$inferSelect,
): Promise<void> {
	const reminders = await db
		.select()
		.from(calReminders)
		.where(
			and(
				eq(calReminders.organizationId, organizationId),
				eq(calReminders.eventId, event.id),
				eq(calReminders.status, "scheduled"),
			),
		);
	if (reminders.length === 0) return;

	const now = new Date();
	for (const reminder of reminders) {
		// An `absolute` reminder fires at a fixed instant that does NOT depend on
		// the event's anchor, so a dtstart/rrule/tz change can't move it — leave it
		// untouched. Only `relative` (offset-before-occurrence) reminders re-derive.
		if (reminder.offsetMinutes === null) continue;
		const nextFireAt = computeNextFireAt({
			event,
			offsetMinutes: reminder.offsetMinutes,
			absoluteFireAt: reminder.absoluteFireAt,
			now,
		});
		await db
			.update(calReminders)
			.set(
				nextFireAt
					? { nextFireAt }
					: // No future instant remains after the reschedule — retire it.
						{ status: "fired" as const },
			)
			.where(
				and(
					eq(calReminders.id, reminder.id),
					eq(calReminders.organizationId, organizationId),
				),
			);
	}
}

function toExpandable(event: typeof calEvents.$inferSelect): ExpandableEvent {
	return {
		id: event.id,
		dtstart: event.dtstart,
		dtend: event.dtend,
		timezone: event.timezone,
		allDay: event.allDay,
		rrule: event.rrule,
		exdates: event.exdates,
	};
}

/** Map a persisted override row to the expander's {@link OccurrenceOverride}. */
function toOccurrenceOverride(
	row: typeof calEventOccurrences.$inferSelect,
): OccurrenceOverride {
	return {
		originalStart: row.originalStart,
		cancelled: row.cancelled,
		dtstart: row.overrideDtstart,
		dtend: row.overrideDtend,
		title: row.overrideTitle,
		description: row.overrideDescription,
		location: row.overrideLocation,
		allDay: row.overrideAllDay,
	};
}

/**
 * A per-occurrence override (RECURRENCE-ID) targets ONE instance of a recurring
 * series. Resolve the event with writer access, then hard-require a non-null
 * rrule — a one-off event has no instances to override, so this is `BAD_REQUEST`.
 */
async function getRecurringEventForOverride(
	organizationId: string,
	userId: string,
	eventId: string,
) {
	const event = await getEventWithAccess(
		organizationId,
		userId,
		eventId,
		"writer",
	);
	if (!event.rrule) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Переопределить можно только повторяющееся событие",
		});
	}
	return event;
}

/**
 * Defensive guard for the per-occurrence "teleport" bug. A buggy client that
 * seeds the edit dialog from the SERIES anchor (`event.dtstart`/`event.dtend`)
 * rather than the clicked instance sends the anchor as THIS instance's
 * `dtstart`/`dtend`; the expander then moves the instance to the series start
 * even when the user never touched the time.
 *
 * Two non-moves are recognised and stored as NULL (inherit the series time):
 *   1. the instance is on its natural slot (`originalStart` + series duration) —
 *      a redundant no-op override, and
 *   2. a NON-first instance whose time equals the SERIES anchor — the signature
 *      of an anchor-seeded client that never moved the instance.
 * Either way a pure field edit still persists while the instance keeps its own
 * date. A genuine time move (anywhere else) is stored verbatim.
 */
function sanitizeOccurrenceTimeOverride(
	event: typeof calEvents.$inferSelect,
	originalStart: Date,
	dtstart: Date | null,
	dtend: Date | null,
): { overrideDtstart: Date | null; overrideDtend: Date | null } {
	if (dtstart === null) return { overrideDtstart: null, overrideDtend: dtend };
	const seriesDurationMs = event.dtend.getTime() - event.dtstart.getTime();

	// (1) On its natural slot (originalStart + series duration): not a move, so a
	// time override is redundant — inherit the series time.
	const naturalStartMs = originalStart.getTime();
	const naturalEndMs = naturalStartMs + seriesDurationMs;
	const onNaturalSlot =
		dtstart.getTime() === naturalStartMs &&
		(dtend === null || dtend.getTime() === naturalEndMs);

	// (2) Anchor-seeded teleport: a buggy client seeds the dialog from the SERIES
	// anchor and sends it as a NON-first instance's time. The anchor is the first
	// occurrence's slot, so a non-first instance "moved" onto the anchor is never
	// a real edit — drop the time override rather than teleport the instance.
	const isFirstInstance = naturalStartMs === event.dtstart.getTime();
	const onSeriesAnchor =
		dtstart.getTime() === event.dtstart.getTime() &&
		(dtend === null || dtend.getTime() === event.dtend.getTime());
	const anchorSeededTeleport = !isFirstInstance && onSeriesAnchor;

	if (onNaturalSlot || anchorSeededTeleport) {
		return { overrideDtstart: null, overrideDtend: null };
	}
	return { overrideDtstart: dtstart, overrideDtend: dtend };
}

/** An attendee request after handle-resolution: only userId/email kinds remain. */
type ResolvedAttendee =
	| { kind: "userId"; userId: string }
	| { kind: "email"; email: string };

/** Any attendee request accepted by the schema (userId | email | handle). */
type AttendeeRequest =
	| { kind: "userId"; userId: string }
	| { kind: "email"; email: string }
	| { kind: "handle"; handle: string };

/**
 * C8: resolve `@handle` attendees to their owning userId via
 * `user_profiles.handle`, leaving userId/email kinds untouched. The handle has
 * already been normalized (no `@`, lower-cased) by the zod transform. An unknown
 * handle is a `BAD_REQUEST` so the caller learns the typo instead of silently
 * dropping the invitee.
 */
async function resolveAttendees(
	attendees: AttendeeRequest[],
): Promise<ResolvedAttendee[]> {
	const handles = Array.from(
		new Set(attendees.flatMap((a) => (a.kind === "handle" ? [a.handle] : []))),
	);
	const byHandle = new Map<string, string>();
	if (handles.length > 0) {
		const rows = await db
			.select({ userId: userProfiles.userId, handle: userProfiles.handle })
			.from(userProfiles)
			.where(inArray(userProfiles.handle, handles));
		for (const row of rows) {
			if (row.handle) byHandle.set(row.handle, row.userId);
		}
	}
	return attendees.map((a) => {
		if (a.kind !== "handle") return a;
		const userId = byHandle.get(a.handle);
		if (!userId) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Пользователь @${a.handle} не найден`,
			});
		}
		return { kind: "userId", userId };
	});
}

export const calendarRouter = {
	// ---- calendars --------------------------------------------------------
	listCalendars: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = await requireActiveOrgMembership(ctx);
		const userId = ctx.session.user.id;
		const ids = await readableCalendarIds(organizationId, userId);
		if (ids.length === 0) return [];
		const rows = await db
			.select()
			.from(calCalendars)
			.where(
				and(
					eq(calCalendars.organizationId, organizationId),
					inArray(calCalendars.id, ids),
				),
			)
			.orderBy(asc(calCalendars.name));
		// SECURITY: the public feed token is a secret capability — never ship it to
		// the client (a share-reader would otherwise receive the owner's token in
		// the full row). Project it to a derived `feedEnabled` boolean instead; the
		// owner only ever receives the raw token from the enable/rotate mutations.
		return rows.map(({ feedToken, ...rest }) => ({
			...rest,
			feedEnabled: feedToken !== null,
		}));
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
			// C1/S3: a calendar can only be shared with a member of the same org.
			await verifyOrgMembership(input.userId, organizationId);
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

	// ---- public ICS subscribe feed (owner-managed) ------------------------
	// Only the OWNER manages the public feed (`resolveCalendarAccess(..,'owner')`
	// throws NOT_FOUND for a wrong-org calendar and FORBIDDEN for a non-owner
	// member). The token is a secret capability returned ONLY here; it is stripped
	// from `listCalendars`. Every statement stays org-scoped.

	/**
	 * Enable (or re-configure) the public subscribe feed. Generates a token on
	 * first enable and keeps the existing one on a re-enable (so an already-shared
	 * URL keeps working); `busyOnly` updates the variant. Returns the live token,
	 * its public URL, and the variant.
	 */
	enableCalendarFeed: protectedProcedure
		.input(enableCalendarFeedSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const { calendar } = await resolveCalendarAccess(
				organizationId,
				ctx.session.user.id,
				input.calendarId,
				"owner",
			);
			// Reuse an existing token so a published URL survives a re-enable; mint a
			// fresh one only when the feed was disabled.
			const token = calendar.feedToken ?? generateFeedToken();
			const busyOnly = input.busyOnly ?? calendar.feedBusyOnly;
			const [row] = await db
				.update(calCalendars)
				.set({
					feedToken: token,
					feedBusyOnly: busyOnly,
					feedTokenCreatedAt: calendar.feedTokenCreatedAt ?? new Date(),
				})
				.where(
					and(
						eq(calCalendars.id, input.calendarId),
						eq(calCalendars.organizationId, organizationId),
					),
				)
				.returning({ feedToken: calCalendars.feedToken });
			const liveToken = row?.feedToken ?? token;
			return {
				token: liveToken,
				url: getCalendarFeedUrl(liveToken),
				busyOnly,
			};
		}),

	/** Disable (revoke) the public feed: NULL the token so the route 404s. */
	disableCalendarFeed: protectedProcedure
		.input(disableCalendarFeedSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await resolveCalendarAccess(
				organizationId,
				ctx.session.user.id,
				input.calendarId,
				"owner",
			);
			await db
				.update(calCalendars)
				.set({ feedToken: null, feedTokenCreatedAt: null })
				.where(
					and(
						eq(calCalendars.id, input.calendarId),
						eq(calCalendars.organizationId, organizationId),
					),
				);
			return { ok: true as const };
		}),

	/**
	 * Rotate the feed token: overwrite with a fresh one so a previously-shared
	 * (possibly leaked) URL immediately 404s. The old token is never resurrected.
	 */
	rotateCalendarFeed: protectedProcedure
		.input(rotateCalendarFeedSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await resolveCalendarAccess(
				organizationId,
				ctx.session.user.id,
				input.calendarId,
				"owner",
			);
			const token = generateFeedToken();
			await db
				.update(calCalendars)
				.set({ feedToken: token, feedTokenCreatedAt: new Date() })
				.where(
					and(
						eq(calCalendars.id, input.calendarId),
						eq(calCalendars.organizationId, organizationId),
					),
				);
			return { token, url: getCalendarFeedUrl(token) };
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

			// Engine-validate the rule against this row's own anchor before it can
			// reach the DB (the zod layer only bounds length + cadence).
			if (input.rrule) {
				assertValidRrule(input.rrule, input.dtstart, input.timezone ?? "UTC");
			}

			// C8: resolve `@handle` attendees to userIds before the membership guard.
			const resolvedAttendees = await resolveAttendees(input.attendees ?? []);

			// C1/S3: every in-app attendee MUST be a member of the caller's org.
			// Email-kind attendees are external invitees and exempt.
			await assertOrgMembers(
				organizationId,
				resolvedAttendees.flatMap((a) =>
					a.kind === "userId" ? [a.userId] : [],
				),
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
					...resolvedAttendees
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
			const existing = await getEventWithAccess(
				organizationId,
				ctx.session.user.id,
				input.eventId,
				"writer",
			);

			// When the caller sets a non-null rule, validate it against the row's
			// effective anchor (the incoming dtstart/timezone, else the stored one).
			if (input.rrule) {
				assertValidRrule(
					input.rrule,
					input.dtstart ?? existing.dtstart,
					input.timezone ?? existing.timezone,
				);
			}

			// #528: did this edit move the event's recurrence anchor? Only a real
			// change to dtstart / rrule / timezone / exdates can shift a relative
			// reminder's fire instant, so we gate the (write-bearing) reminder
			// recompute on an actual delta — a pure title/description/location edit
			// must NOT re-touch reminders.
			const timingChanged =
				(input.dtstart !== undefined &&
					input.dtstart.getTime() !== existing.dtstart.getTime()) ||
				(input.rrule !== undefined && input.rrule !== existing.rrule) ||
				(input.timezone !== undefined &&
					input.timezone !== existing.timezone) ||
				(input.exdates !== undefined &&
					!sameExdates(input.exdates, existing.exdates));

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

			// #528: when the event's timing anchor (dtstart / rrule / timezone /
			// exdates) changes, every scheduled reminder's materialized
			// `next_fire_at` is now stale and would keep firing at the OLD instant
			// until the reminder is itself re-saved. Recompute each scheduled
			// reminder's fire instant off the freshly-written row (which already
			// reflects this update) via the same pure `computeNextFireAt` helper
			// `updateReminder` uses, so a rescheduled series moves its reminders
			// coherently.
			if (row && timingChanged) {
				await recomputeRemindersForEvent(organizationId, row);
			}
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
			// C8: resolve an `@handle` attendee to its userId first.
			const [attendee] = await resolveAttendees([input.attendee]);
			if (!attendee) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Некорректный участник",
				});
			}
			// C1/S3: an in-app attendee MUST be a member of the caller's org.
			// Email-kind attendees are external invitees and exempt.
			if (attendee.kind === "userId") {
				await assertOrgMembers(organizationId, [attendee.userId]);
			}
			const [row] = await db
				.insert(calEventAttendees)
				.values(
					attendee.kind === "userId"
						? {
								organizationId,
								eventId: event.id,
								userId: attendee.userId,
								email: null,
								status: "needs_action" as const,
							}
						: {
								organizationId,
								eventId: event.id,
								userId: null,
								email: attendee.email,
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

	// ---- reminders (C6) ---------------------------------------------------
	// A reminder is PERSONAL: `owner_user_id` is forced to the caller, and
	// reader access to the event is enough (mirrors `rsvp`). `next_fire_at` is
	// materialized from the event's anchor via the pure `reminders.ts` helper.

	/** The caller's own reminders for an event they can read. */
	listReminders: protectedProcedure
		.input(listRemindersSchema)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			await getEventWithAccess(organizationId, userId, input.eventId, "reader");
			return db
				.select()
				.from(calReminders)
				.where(
					and(
						eq(calReminders.organizationId, organizationId),
						eq(calReminders.eventId, input.eventId),
						eq(calReminders.ownerUserId, userId),
					),
				)
				.orderBy(asc(calReminders.nextFireAt));
		}),

	/** Create a personal reminder on an event the caller can read. */
	createReminder: protectedProcedure
		.input(createReminderSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			// Reader access is enough — a reminder is personal, like an RSVP.
			const event = await getEventWithAccess(
				organizationId,
				userId,
				input.eventId,
				"reader",
			);

			// Anti-spam: cap reminders per (event, owner).
			const [existing] = await db
				.select({ value: count() })
				.from(calReminders)
				.where(
					and(
						eq(calReminders.organizationId, organizationId),
						eq(calReminders.eventId, input.eventId),
						eq(calReminders.ownerUserId, userId),
					),
				);
			if ((existing?.value ?? 0) >= MAX_REMINDERS_PER_EVENT) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Слишком много напоминаний на событие (максимум ${MAX_REMINDERS_PER_EVENT})`,
				});
			}

			const offsetMinutes =
				input.trigger === "relative" ? (input.offsetMinutes ?? null) : null;
			const absoluteFireAt =
				input.trigger === "absolute" ? (input.absoluteFireAt ?? null) : null;

			const nextFireAt = computeNextFireAt({
				event,
				offsetMinutes,
				absoluteFireAt,
				now: new Date(),
			});
			if (!nextFireAt) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Напоминание не имеет будущего момента срабатывания",
				});
			}

			const [row] = await db
				.insert(calReminders)
				.values({
					organizationId,
					eventId: input.eventId,
					ownerUserId: userId,
					channel: input.channel,
					triggerKind: input.trigger,
					offsetMinutes,
					absoluteFireAt,
					nextFireAt,
					status: "scheduled",
				})
				.returning();
			return row;
		}),

	/** Update one of the caller's own reminders (recomputes next_fire_at). */
	updateReminder: protectedProcedure
		.input(updateReminderSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;

			const [reminder] = await db
				.select()
				.from(calReminders)
				.where(
					and(
						eq(calReminders.id, input.reminderId),
						eq(calReminders.organizationId, organizationId),
						eq(calReminders.ownerUserId, userId),
					),
				)
				.limit(1);
			if (!reminder) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Reminder not found",
				});
			}
			const event = await getEventWithAccess(
				organizationId,
				userId,
				reminder.eventId,
				"reader",
			);

			// Effective trigger after this update (falls back to the stored kind).
			const trigger = input.trigger ?? reminder.triggerKind;
			const offsetMinutes =
				trigger === "relative"
					? (input.offsetMinutes ?? reminder.offsetMinutes ?? null)
					: null;
			const absoluteFireAt =
				trigger === "absolute"
					? (input.absoluteFireAt ?? reminder.absoluteFireAt ?? null)
					: null;

			const nextFireAt = computeNextFireAt({
				event,
				offsetMinutes,
				absoluteFireAt,
				now: new Date(),
			});
			if (!nextFireAt) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Напоминание не имеет будущего момента срабатывания",
				});
			}

			const [row] = await db
				.update(calReminders)
				.set({
					...(input.channel !== undefined ? { channel: input.channel } : {}),
					triggerKind: trigger,
					offsetMinutes,
					absoluteFireAt,
					nextFireAt,
					// Re-arm a reminder that had already fired/failed.
					status: "scheduled",
				})
				.where(
					and(
						eq(calReminders.id, input.reminderId),
						eq(calReminders.organizationId, organizationId),
						eq(calReminders.ownerUserId, userId),
					),
				)
				.returning();
			return row;
		}),

	/** Delete one of the caller's own reminders. */
	deleteReminder: protectedProcedure
		.input(deleteReminderSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			await db
				.delete(calReminders)
				.where(
					and(
						eq(calReminders.id, input.reminderId),
						eq(calReminders.organizationId, organizationId),
						eq(calReminders.ownerUserId, userId),
					),
				);
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
			if (calendarIds.length === 0) {
				return { occurrences: [], events: [], truncated: false };
			}

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

			// Per-occurrence overrides (RECURRENCE-ID) apply only to recurring
			// events; fetch them for the active recurring ids in one org-scoped
			// query and group by eventId so the expander can drop a cancelled
			// instance or patch a moved one. One-off events skip this entirely.
			const recurringIds = active
				.filter((e) => e.rrule !== null)
				.map((e) => e.id);
			const overridesByEventId = new Map<string, OccurrenceOverride[]>();
			if (recurringIds.length > 0) {
				const overrideRows = await db
					.select()
					.from(calEventOccurrences)
					.where(
						and(
							eq(calEventOccurrences.organizationId, organizationId),
							inArray(calEventOccurrences.eventId, recurringIds),
						),
					);
				for (const row of overrideRows) {
					const list = overridesByEventId.get(row.eventId) ?? [];
					list.push(toOccurrenceOverride(row));
					overridesByEventId.set(row.eventId, list);
				}
			}

			const expansion = expandEvents(
				active.map(toExpandable),
				input.rangeStart,
				input.rangeEnd,
				overridesByEventId,
			);
			const occurrences = expansion.occurrences.map((o) => ({
				eventId: o.eventId,
				start: o.start.toISOString(),
				end: o.end.toISOString(),
				// Additive: the RECURRENCE-ID the client threads back to the
				// per-occurrence procedures, and whether an override patched it.
				originalStart: (o.originalStart ?? o.start).toISOString(),
				overridden: o.overridden ?? false,
				// Additive per-occurrence field overrides ("this event only"): each
				// is present only when the override row set that column, so a consumer
				// prefers it over the series event and otherwise inherits the series.
				title: o.title,
				description: o.description,
				location: o.location,
				allDay: o.allDay,
			}));

			// `truncated` is additive: existing consumers keep reading
			// `occurrences`/`events`; a true flag means a sub-daily rule hit the
			// per-event cap and the window may be missing later instances.
			return { occurrences, events: active, truncated: expansion.truncated };
		}),

	// ---- per-occurrence overrides (RECURRENCE-ID, "this event only") ------
	// An override targets ONE instance of a recurring series, keyed by the
	// event + its `original_start` (the instant the expander emits BEFORE any
	// override). update/cancel UPSERT on that unique key; delete reverts to the
	// series default. Every statement is org-scoped and forces ownerUserId to
	// the caller. EXDATE stays the whole-series skip; this is the reversible
	// per-instance mechanism.

	/** Patch a single instance of a recurring event ("this event only"). */
	updateOccurrence: protectedProcedure
		.input(updateOccurrenceSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			const event = await getRecurringEventForOverride(
				organizationId,
				userId,
				input.eventId,
			);

			// Guard the "teleport" bug: a client that seeds the edit dialog from the
			// SERIES anchor (dtstart/dtend) instead of the clicked instance writes
			// the anchor as this instance's override, moving it to the series start.
			// The anchor instant is the first occurrence, so a NON-first instance
			// (originalStart ≠ anchor) "moved" to exactly the anchor time is never a
			// real edit — drop the time override (inherit the series) so a pure
			// field edit still saves and the instance stays on its own date.
			const { overrideDtstart, overrideDtend } = sanitizeOccurrenceTimeOverride(
				event,
				input.originalStart,
				input.dtstart ?? null,
				input.dtend ?? null,
			);

			const [row] = await db
				.insert(calEventOccurrences)
				.values({
					organizationId,
					eventId: input.eventId,
					ownerUserId: userId,
					originalStart: input.originalStart,
					cancelled: false,
					// nullish → null clears the field back to "inherit the series".
					overrideTitle: input.title ?? null,
					overrideDescription: input.description ?? null,
					overrideLocation: input.location ?? null,
					overrideDtstart,
					overrideDtend,
					overrideAllDay: input.allDay ?? null,
				})
				.onConflictDoUpdate({
					target: [
						calEventOccurrences.eventId,
						calEventOccurrences.originalStart,
					],
					// Set EVERY override column so re-saving an edit that cleared a
					// field doesn't leave a stale value, and un-cancel on re-edit.
					set: {
						ownerUserId: userId,
						cancelled: false,
						overrideTitle: input.title ?? null,
						overrideDescription: input.description ?? null,
						overrideLocation: input.location ?? null,
						overrideDtstart,
						overrideDtend,
						overrideAllDay: input.allDay ?? null,
					},
				})
				.returning();
			if (!row) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to save occurrence override",
				});
			}
			return row;
		}),

	/** Cancel a single instance of a recurring event (reversible). */
	cancelOccurrence: protectedProcedure
		.input(cancelOccurrenceSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			await getRecurringEventForOverride(organizationId, userId, input.eventId);

			await db
				.insert(calEventOccurrences)
				.values({
					organizationId,
					eventId: input.eventId,
					ownerUserId: userId,
					originalStart: input.originalStart,
					cancelled: true,
				})
				.onConflictDoUpdate({
					target: [
						calEventOccurrences.eventId,
						calEventOccurrences.originalStart,
					],
					set: { cancelled: true, ownerUserId: userId },
				});
			return { ok: true as const };
		}),

	/** Delete a per-occurrence override row, reverting to the series default. */
	deleteOccurrenceOverride: protectedProcedure
		.input(restoreOccurrenceSchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const userId = ctx.session.user.id;
			await getRecurringEventForOverride(organizationId, userId, input.eventId);

			await db
				.delete(calEventOccurrences)
				.where(
					and(
						eq(calEventOccurrences.organizationId, organizationId),
						eq(calEventOccurrences.eventId, input.eventId),
						eq(calEventOccurrences.originalStart, input.originalStart),
					),
				);
			return { ok: true as const };
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
			if (parsed.length > MAX_IMPORT_EVENTS) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Слишком много событий в файле .ics (максимум ${MAX_IMPORT_EVENTS})`,
				});
			}

			const values = parsed.map((e) => {
				// The .ics path bypasses the zod RRULE refinement, so a malformed or
				// too-frequent rule from an untrusted file would otherwise be stored
				// verbatim and poison every later read for this calendar's viewers.
				if (e.rrule) {
					assertValidRrule(e.rrule, e.dtstart, calendar.timezone);
				}
				return {
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
					exdates: (e.exdates ?? []).slice(0, MAX_IMPORT_EXDATES),
				};
			});

			// Chunk the insert so one upload can't issue a single unbounded
			// statement; sum the returned row counts across batches.
			let imported = 0;
			for (let i = 0; i < values.length; i += IMPORT_INSERT_CHUNK) {
				const batch = values.slice(i, i + IMPORT_INSERT_CHUNK);
				const rows = await db
					.insert(calEvents)
					.values(batch)
					.returning({ id: calEvents.id });
				imported += rows.length;
			}
			return { imported };
		}),
} satisfies TRPCRouterRecord;
