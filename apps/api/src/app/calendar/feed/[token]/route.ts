/**
 * GET /calendar/feed/<token> — the PUBLIC, unauthenticated ICS subscribe feed.
 *
 * The owner enables a calendar's feed via `calendar.enableCalendarFeed`, which
 * mints an unguessable `feed_token`. This route serves that calendar as a live
 * `text/calendar` document Apple/Google/Outlook can subscribe to. The token IS
 * the capability — there is NO session/org check — so:
 *   - an unknown token AND a disabled (NULL-token) calendar both resolve to a
 *     bare 404 (revoked and never-existed are indistinguishable → no enumeration
 *     oracle; the 192-bit token already makes brute force infeasible), and
 *   - the row's `feed_busy_only` selects the detail-free free-busy variant (busy
 *     intervals only) over the full-detail feed.
 *
 * Lives OUTSIDE `/api/` so the URL is clean; `proxy.ts` only injects CORS (it
 * does not gate auth), so a public path here is safe. Node runtime (default) so
 * it can use `@rox/db/client`, per the mail/inbound + reminders/dispatch
 * precedent.
 */

import { db } from "@rox/db/client";
import { calCalendars, calEventOccurrences, calEvents } from "@rox/db/schema";
import {
	buildPublicCalendarFeed,
	type OccurrenceOverride,
} from "@rox/trpc/calendar-feed";
import { and, eq, inArray } from "drizzle-orm";

export const dynamic = "force-dynamic";

/** Token shape guard: url-safe base64url charset, bounded length. */
const FEED_TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

/** Bare 404 with no body detail (same for unknown + revoked). */
function notFound(): Response {
	return new Response("Not found", { status: 404 });
}

/** A safe, header-friendly filename for the calendar (ASCII fallback). */
function feedFilename(name: string): string {
	const safe = name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "");
	return `${safe || "calendar"}.ics`;
}

export async function GET(
	_request: Request,
	ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
	const { token } = await ctx.params;
	if (!FEED_TOKEN_RE.test(token)) return notFound();

	// The token is the capability: look up by token alone (no org filter). A miss
	// OR a row whose token was nulled (revoked) is indistinguishable from unknown.
	const [calendar] = await db
		.select()
		.from(calCalendars)
		.where(eq(calCalendars.feedToken, token))
		.limit(1);
	if (!calendar || calendar.feedToken === null) return notFound();

	const events = await db
		.select()
		.from(calEvents)
		.where(
			and(
				eq(calEvents.organizationId, calendar.organizationId),
				eq(calEvents.calendarId, calendar.id),
			),
		);

	// Per-occurrence overrides (RECURRENCE-ID) apply only to recurring, non-
	// cancelled events; load them for those event ids in one org-scoped query and
	// group by eventId so the feed builder can drop a cancelled instance (EXDATE /
	// omitted busy span) or patch a moved one — mirroring `listOccurrences`. The
	// free-busy variant still exposes only busy intervals; overrides just correct
	// which intervals (and when) are emitted.
	const recurringIds = events
		.filter((e) => e.status !== "cancelled" && e.rrule !== null)
		.map((e) => e.id);
	const overridesByEventId = new Map<string, OccurrenceOverride[]>();
	if (recurringIds.length > 0) {
		const overrideRows = await db
			.select()
			.from(calEventOccurrences)
			.where(
				and(
					eq(calEventOccurrences.organizationId, calendar.organizationId),
					inArray(calEventOccurrences.eventId, recurringIds),
				),
			);
		for (const row of overrideRows) {
			const list = overridesByEventId.get(row.eventId) ?? [];
			list.push({
				originalStart: row.originalStart,
				cancelled: row.cancelled,
				dtstart: row.overrideDtstart,
				dtend: row.overrideDtend,
				title: row.overrideTitle,
				description: row.overrideDescription,
				location: row.overrideLocation,
				allDay: row.overrideAllDay,
			});
			overridesByEventId.set(row.eventId, list);
		}
	}

	const ics = buildPublicCalendarFeed({
		calendar: { name: calendar.name, timezone: calendar.timezone },
		events,
		busyOnly: calendar.feedBusyOnly,
		overridesByEventId,
	});

	return new Response(ics, {
		headers: {
			"Content-Type": "text/calendar; charset=utf-8",
			"Content-Disposition": `inline; filename="${feedFilename(calendar.name)}"`,
			// Short private TTL: calendar clients poll frequently; cap staleness so a
			// revoke takes effect within the window (no instant-revocation guarantee).
			"Cache-Control": "private, max-age=300",
		},
	});
}
