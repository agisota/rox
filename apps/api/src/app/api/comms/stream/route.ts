/**
 * GET /api/comms/stream — live unified-inbox delivery over SSE (hardening epic).
 *
 * Mirrors the agent-chat streaming idiom (`auth.api.getSession` gate + a
 * streaming `Response`), but the event source is the in-process
 * {@link commsEventBus} rather than an external durable-streams proxy.
 *
 * Each connection:
 *   1. authenticates the caller (401 if no session);
 *   2. resolves the caller's org memberships ONCE (the cheap pre-filter set);
 *   3. subscribes to the comms bus and, per event, runs {@link canReceiveCommsEvent}
 *      — the LEAK-SURFACE gate that confirms (org match AND thread participation)
 *      against `comms_participants` before any byte reaches the client;
 *   4. emits a `: ping` comment every {@link HEARTBEAT_MS} so idle proxies don't
 *      drop the stream;
 *   5. unsubscribes + closes on client abort.
 *
 * The payload is intentionally minimal (`threadId`, `messageId`, `transport`):
 * the client uses it to invalidate/append the right tRPC cache, then refetches
 * the authoritative row. No message body crosses this stream.
 *
 * SCOPE: in-process bus → single-instance live delivery only (see event-bus.ts).
 * Cross-instance fan-out is deferred; clients keep their tRPC refetch as backstop.
 */

import { auth } from "@rox/auth/server";
import { db } from "@rox/db/client";
import { members } from "@rox/db/schema";
import { eq } from "drizzle-orm";
import { type CommsMessageEvent, commsEventBus } from "@/lib/comms/event-bus";
import { canReceiveCommsEvent } from "@/lib/comms/thread-access";
import { createThreadAccessDb } from "@/lib/comms/thread-access-db";

const HEARTBEAT_MS = 25_000;

/** Resolve the caller's org membership ids (the SSE pre-filter set). */
async function loadUserOrgIds(userId: string): Promise<Set<string>> {
	const rows = await db
		.select({ organizationId: members.organizationId })
		.from(members)
		.where(eq(members.userId, userId));
	return new Set(rows.map((r) => r.organizationId));
}

function sseFrame(event: CommsMessageEvent): string {
	return `event: message\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function GET(request: Request): Promise<Response> {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) return new Response("Unauthorized", { status: 401 });

	const userId = session.user.id;
	const userOrgIds = await loadUserOrgIds(userId);
	const gateDb = createThreadAccessDb();

	const encoder = new TextEncoder();
	let unsubscribe: (() => void) | null = null;
	let heartbeat: ReturnType<typeof setInterval> | null = null;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const enqueue = (chunk: string) => {
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					// Controller already closed (client gone) — cleanup runs via abort.
				}
			};

			// Open the stream so the client's EventSource resolves `onopen`.
			enqueue(": connected\n\n");

			unsubscribe = commsEventBus.subscribe((event) => {
				// LEAK GATE: never forward an event the caller isn't entitled to.
				void canReceiveCommsEvent(gateDb, {
					userId,
					userOrgIds,
					event,
				})
					.then((allowed) => {
						if (allowed) enqueue(sseFrame(event));
					})
					.catch(() => {
						// A gate failure fails CLOSED — drop the event rather than risk a
						// leak. The client refetch remains the backstop.
					});
			});

			heartbeat = setInterval(() => enqueue(": ping\n\n"), HEARTBEAT_MS);
		},

		cancel() {
			unsubscribe?.();
			if (heartbeat) clearInterval(heartbeat);
		},
	});

	// Belt-and-suspenders cleanup: ReadableStream.cancel covers most runtimes, but
	// also tear down on the request's abort signal.
	request.signal.addEventListener("abort", () => {
		unsubscribe?.();
		if (heartbeat) clearInterval(heartbeat);
	});

	return new Response(stream, {
		status: 200,
		headers: {
			"Content-Type": "text/event-stream; charset=utf-8",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
			"X-Accel-Buffering": "no",
		},
	});
}
