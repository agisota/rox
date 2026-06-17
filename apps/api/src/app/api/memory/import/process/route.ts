/**
 * Archive import processor — journal-memory epic.
 *
 * Enqueued by memory.startArchiveImport. Verifies the QStash signature, fetches
 * the uploaded export from Vercel Blob, parses it into conversations, asks R1 to
 * extract durable memories per conversation, and inserts them as suggested
 * (source=archive). Deletes the blob afterwards (the export holds private chats).
 */

import { db } from "@rox/db/client";
import { memoryImportJobs, memoryItems } from "@rox/db/schema";
import { Receiver } from "@upstash/qstash";
import { del } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { env } from "@/env";
import { classifyConversation } from "@/lib/memory/archive-classify";
import { parseArchiveExport } from "@/lib/memory/archive-parse";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const inputSchema = z.object({ jobId: z.string().uuid() });
const MAX_CONVERSATIONS = 30;

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");
	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}
	const valid = await receiver
		.verify({
			body,
			signature,
			url: `${env.NEXT_PUBLIC_API_URL}/api/memory/import/process`,
		})
		.catch(() => false);
	if (!valid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const parsed = inputSchema.safeParse(JSON.parse(body));
	if (!parsed.success) {
		return Response.json({ error: "Invalid input" }, { status: 400 });
	}
	const { jobId } = parsed.data;

	const [job] = await db
		.select()
		.from(memoryImportJobs)
		.where(eq(memoryImportJobs.id, jobId))
		.limit(1);
	if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
	if (!job.blobUrl) {
		await db
			.update(memoryImportJobs)
			.set({ status: "failed", error: "No blob URL on job" })
			.where(eq(memoryImportJobs.id, jobId));
		return Response.json({ status: "failed" });
	}

	await db
		.update(memoryImportJobs)
		.set({ status: "processing" })
		.where(eq(memoryImportJobs.id, jobId));

	try {
		const res = await fetch(job.blobUrl);
		if (!res.ok) throw new Error(`Blob fetch failed: ${res.status}`);
		const content = await res.text();

		const conversations = parseArchiveExport(job.provider, content).slice(
			0,
			MAX_CONVERSATIONS,
		);

		const existing = await db
			.select({ body: memoryItems.body, category: memoryItems.category })
			.from(memoryItems)
			.where(
				and(
					eq(memoryItems.organizationId, job.organizationId),
					eq(memoryItems.createdBy, job.createdBy),
				),
			);
		const seen = new Set(
			existing.map((e) => `${e.category}::${e.body.trim().toLowerCase()}`),
		);

		const classificationResults = await Promise.allSettled(
			conversations.map((convo) => classifyConversation(convo.text)),
		);
		const failedClassifications = classificationResults.filter(
			(result): result is PromiseRejectedResult => result.status === "rejected",
		);
		if (failedClassifications.length > 0) {
			console.warn("[memory/import/process] Some conversations failed R1", {
				jobId,
				failed: failedClassifications.length,
				total: conversations.length,
				errors: failedClassifications.map((result) =>
					String(result.reason).slice(0, 500),
				),
			});
		}
		if (
			conversations.length > 0 &&
			failedClassifications.length === conversations.length
		) {
			throw new Error(
				`All ${conversations.length} conversations failed classification`,
			);
		}
		const classifiedConversations = classificationResults
			.filter(
				(
					result,
				): result is PromiseFulfilledResult<
					Awaited<ReturnType<typeof classifyConversation>>
				> => result.status === "fulfilled",
			)
			.map((result) => result.value);

		const toInsert: (typeof memoryItems.$inferInsert)[] = [];
		for (const memories of classifiedConversations) {
			for (const m of memories) {
				const key = `${m.category}::${m.body.trim().toLowerCase()}`;
				if (seen.has(key)) continue;
				seen.add(key);
				toInsert.push({
					organizationId: job.organizationId,
					createdBy: job.createdBy,
					category: m.category,
					body: m.body,
					source: "archive",
					status: "suggested",
					importJobId: jobId,
				});
			}
		}

		if (toInsert.length > 0) {
			await db.insert(memoryItems).values(toInsert);
		}

		await db
			.update(memoryImportJobs)
			.set({
				status: "done",
				stats: {
					conversations: conversations.length,
					failedConversations: failedClassifications.length,
					imported: toInsert.length,
				},
			})
			.where(eq(memoryImportJobs.id, jobId));

		return Response.json({
			status: "done",
			imported: toInsert.length,
			failedConversations: failedClassifications.length,
		});
	} catch (error) {
		await db
			.update(memoryImportJobs)
			.set({ status: "failed", error: String(error).slice(0, 500) })
			.where(eq(memoryImportJobs.id, jobId));
		return Response.json({ status: "failed" }, { status: 500 });
	} finally {
		// The export contains private chats — drop it after every terminal path.
		await del(job.blobUrl).catch((deleteError) => {
			console.error("[memory/import/process] Failed to delete blob", {
				jobId,
				deleteError,
			});
		});
	}
}
