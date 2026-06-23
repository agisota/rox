import type { EmitterWebhookEvent } from "@octokit/webhooks";
import { db } from "@rox/db/client";
import { webhookEvents } from "@rox/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { apiError } from "@/lib/api-response";
import { webhooks } from "./webhooks";

/**
 * Inbound GitHub webhook envelope. GitHub payloads are large, event-specific
 * unions, so we only assert that the body is a JSON object and let every other
 * field pass through untouched — `webhooks.receive` performs the real per-event
 * typing downstream.
 */
const githubWebhookPayloadSchema = z.looseObject({});

export async function POST(request: Request) {
	const body = await request.text();
	const signature = request.headers.get("x-hub-signature-256");
	const eventType = request.headers.get("x-github-event");
	const deliveryId = request.headers.get("x-github-delivery");

	if (!eventType) {
		console.error("[github/webhook] Missing x-github-event header");
		return apiError("Missing event type", 400);
	}

	let rawPayload: unknown;
	try {
		rawPayload = JSON.parse(body);
	} catch {
		console.error("[github/webhook] Invalid JSON payload");
		return apiError("Invalid JSON payload", 400);
	}

	const parsedPayload = githubWebhookPayloadSchema.safeParse(rawPayload);
	if (!parsedPayload.success) {
		console.error("[github/webhook] Malformed webhook payload");
		return apiError("Invalid payload", 400);
	}
	const payload = parsedPayload.data;

	// Verify signature BEFORE storing to prevent spam from unverified requests
	try {
		await webhooks.verify(body, signature ?? "");
	} catch (error) {
		console.error("[github/webhook] Signature verification failed:", error);
		return apiError("Invalid signature", 401);
	}

	// Store verified event with idempotent handling
	const eventId = deliveryId ?? `github-${crypto.randomUUID()}`;

	const [webhookEvent] = await db
		.insert(webhookEvents)
		.values({
			provider: "github",
			eventId,
			eventType,
			payload,
			status: "pending",
		})
		.onConflictDoUpdate({
			target: [webhookEvents.provider, webhookEvents.eventId],
			set: {
				// Reset for reprocessing only if previously failed
				status: sql`CASE WHEN ${webhookEvents.status} = 'failed' THEN 'pending' ELSE ${webhookEvents.status} END`,
				retryCount: sql`CASE WHEN ${webhookEvents.status} = 'failed' THEN ${webhookEvents.retryCount} + 1 ELSE ${webhookEvents.retryCount} END`,
				error: sql`CASE WHEN ${webhookEvents.status} = 'failed' THEN NULL ELSE ${webhookEvents.error} END`,
			},
		})
		.returning();

	if (!webhookEvent) {
		return apiError("Failed to store event", 500);
	}

	// Idempotent: skip if already processed or not ready for processing
	if (webhookEvent.status === "processed") {
		console.log("[github/webhook] Event already processed:", eventId);
		return Response.json({ success: true, message: "Already processed" });
	}
	if (webhookEvent.status !== "pending") {
		console.log(
			`[github/webhook] Event in ${webhookEvent.status} state:`,
			eventId,
		);
		return Response.json({ success: true, message: "Event not ready" });
	}

	// Process the verified event
	try {
		await webhooks.receive({
			id: deliveryId ?? "",
			name: eventType,
			payload,
			// The validated payload is an opaque JSON object; cast to the SDK's own
			// event union so `receive` can dispatch to the right typed handler.
		} as EmitterWebhookEvent);

		await db
			.update(webhookEvents)
			.set({ status: "processed", processedAt: new Date() })
			.where(eq(webhookEvents.id, webhookEvent.id));

		return Response.json({ success: true });
	} catch (error) {
		console.error("[github/webhook] Webhook processing error:", error);

		await db
			.update(webhookEvents)
			.set({
				status: "failed",
				error: error instanceof Error ? error.message : "Unknown error",
				retryCount: webhookEvent.retryCount + 1,
			})
			.where(eq(webhookEvents.id, webhookEvent.id));

		return apiError("Webhook processing failed", 500);
	}
}
