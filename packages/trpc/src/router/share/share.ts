import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import { db, dbWs } from "@rox/db/client";
import {
	accessGranteeTypeEnum,
	accessGrants,
	accessResourceTypeEnum,
	accessRoleEnum,
	artifacts,
	chatSessions,
	type PublicShareResourceType,
	publicShares,
} from "@rox/db/schema";
import { getCurrentTxid } from "@rox/db/utils";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../../trpc";
import { verifyOrgAdmin } from "../integration/utils";
import { requireActiveOrgMembership } from "../utils/active-org";

const DEFAULT_SHARE_ORIGIN = "https://share.rox.one";
const MAX_PUBLIC_SHARE_BYTES = 2_000_000;
const MAX_CHAT_MESSAGES_PER_SHARE = 500;
const SHARE_SLUG_RE = /^[A-Za-z0-9_-]+$/;

const grantInput = z.object({
	resourceType: accessResourceTypeEnum,
	resourceId: z.string().uuid(),
	granteeType: accessGranteeTypeEnum,
	granteeId: z.string().uuid(),
	role: accessRoleEnum,
});

const shareSlugInput = z.object({
	slug: z.string().min(8).max(80).regex(SHARE_SLUG_RE),
});

const chatShareMessageSchema = z
	.object({
		id: z.string().min(1).max(240),
		role: z.string().min(1).max(40),
		content: z.array(z.unknown()).max(128),
		createdAt: z.union([z.string(), z.date()]).optional(),
	})
	.passthrough();

const publishChatSessionInput = z.object({
	sessionId: z.string().uuid(),
	title: z.string().trim().max(180).optional(),
	messages: z.array(chatShareMessageSchema).max(MAX_CHAT_MESSAGES_PER_SHARE),
});

const publishArtifactInput = z.object({
	artifactId: z.string().uuid(),
});

function createShareSlug(): string {
	return randomBytes(9).toString("base64url");
}

export function getPublicShareUrl(slug: string): string {
	const origin = (
		process.env.SHARE_ORIGIN ??
		process.env.NEXT_PUBLIC_SHARE_ORIGIN ??
		DEFAULT_SHARE_ORIGIN
	).replace(/\/+$/, "");

	return `${origin}/s/${slug}`;
}

function serializeDate(value: Date | string | null | undefined): string | null {
	if (!value) return null;
	if (value instanceof Date) return value.toISOString();
	return value;
}

function normalizePayload(
	payload: Record<string, unknown>,
): Record<string, unknown> {
	let serialized: string;
	try {
		serialized = JSON.stringify(payload);
	} catch {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Share payload must be JSON serializable",
		});
	}

	if (Buffer.byteLength(serialized, "utf8") > MAX_PUBLIC_SHARE_BYTES) {
		throw new TRPCError({
			code: "PAYLOAD_TOO_LARGE",
			message: "Share payload is too large",
		});
	}

	return JSON.parse(serialized) as Record<string, unknown>;
}

async function createPublicShare({
	organizationId,
	resourceType,
	resourceId,
	title,
	payload,
	createdByUserId,
}: {
	organizationId: string;
	resourceType: PublicShareResourceType;
	resourceId: string;
	title?: string | null;
	payload: Record<string, unknown>;
	createdByUserId: string;
}): Promise<{ id: string; slug: string; url: string }> {
	const normalizedPayload = normalizePayload(payload);

	for (let attempt = 0; attempt < 6; attempt += 1) {
		const slug = createShareSlug();
		const existing = await db.query.publicShares.findFirst({
			where: eq(publicShares.slug, slug),
			columns: { id: true },
		});
		if (existing) continue;

		const [row] = await dbWs
			.insert(publicShares)
			.values({
				organizationId,
				resourceType,
				resourceId,
				slug,
				title: title?.trim() || null,
				payload: normalizedPayload,
				createdByUserId,
			})
			.returning({ id: publicShares.id, slug: publicShares.slug });

		if (row) {
			return { id: row.id, slug: row.slug, url: getPublicShareUrl(row.slug) };
		}
	}

	throw new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: "Failed to create public share link",
	});
}

export const shareRouter = {
	/**
	 * Grant (or update) a role on a resource for a user, team, or the whole org.
	 * Upserts on the unique (org, resourceType, resourceId, granteeType,
	 * granteeId) tuple so re-sharing simply changes the role. Returns the row id
	 * plus an Electric `txid` for write-sync.
	 */
	grant: protectedProcedure
		.input(grantInput)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await verifyOrgAdmin(ctx.session.user.id, organizationId);

			const result = await dbWs.transaction(async (tx) => {
				const [row] = await tx
					.insert(accessGrants)
					.values({
						organizationId,
						resourceType: input.resourceType,
						resourceId: input.resourceId,
						granteeType: input.granteeType,
						granteeId: input.granteeId,
						role: input.role,
						createdByUserId: ctx.session.user.id,
					})
					.onConflictDoUpdate({
						target: [
							accessGrants.organizationId,
							accessGrants.resourceType,
							accessGrants.resourceId,
							accessGrants.granteeType,
							accessGrants.granteeId,
						],
						set: { role: input.role },
					})
					.returning({ id: accessGrants.id });

				const txid = await getCurrentTxid(tx);
				return { id: row?.id, txid };
			});

			if (!result.id) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to create access grant",
				});
			}

			return { id: result.id, txid: result.txid };
		}),

	/**
	 * Revoke an existing grant by id. Scoped to the active org so callers can
	 * only revoke grants they can see.
	 */
	revoke: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			await verifyOrgAdmin(ctx.session.user.id, organizationId);

			const result = await dbWs.transaction(async (tx) => {
				const [row] = await tx
					.delete(accessGrants)
					.where(
						and(
							eq(accessGrants.id, input.id),
							eq(accessGrants.organizationId, organizationId),
						),
					)
					.returning({ id: accessGrants.id });

				if (!row) {
					return { deleted: false, txid: null };
				}

				const txid = await getCurrentTxid(tx);
				return { deleted: true, txid };
			});

			if (!result.deleted) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Access grant not found in this organization",
				});
			}

			return { success: true, txid: result.txid };
		}),

	/**
	 * List access grants for the active org, optionally filtered to a single
	 * resource. Any org member may read the grant list.
	 */
	list: protectedProcedure
		.input(
			z
				.object({
					resourceType: accessResourceTypeEnum.optional(),
					resourceId: z.string().uuid().optional(),
				})
				.optional(),
		)
		.query(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);

			const filters = [eq(accessGrants.organizationId, organizationId)];
			if (input?.resourceType) {
				filters.push(eq(accessGrants.resourceType, input.resourceType));
			}
			if (input?.resourceId) {
				filters.push(eq(accessGrants.resourceId, input.resourceId));
			}

			return db.query.accessGrants.findMany({
				where: and(...filters),
				orderBy: desc(accessGrants.createdAt),
			});
		}),

	publishChatSession: protectedProcedure
		.input(publishChatSessionInput)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const session = await db.query.chatSessions.findFirst({
				where: and(
					eq(chatSessions.id, input.sessionId),
					eq(chatSessions.organizationId, organizationId),
					eq(chatSessions.createdBy, ctx.session.user.id),
				),
				columns: {
					id: true,
					title: true,
					workspaceId: true,
					v2WorkspaceId: true,
					createdAt: true,
					updatedAt: true,
				},
			});

			if (!session) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Chat session not found",
				});
			}

			const messages = input.messages.map((message) => ({
				...message,
				createdAt: serializeDate(message.createdAt),
			}));
			const title = input.title ?? session.title ?? "Shared Rox chat";

			return createPublicShare({
				organizationId,
				resourceType: "chat_session",
				resourceId: session.id,
				title,
				createdByUserId: ctx.session.user.id,
				payload: {
					type: "chat_session",
					session: {
						id: session.id,
						title,
						workspaceId: session.workspaceId,
						v2WorkspaceId: session.v2WorkspaceId,
						createdAt: serializeDate(session.createdAt),
						updatedAt: serializeDate(session.updatedAt),
					},
					messages,
					publishedAt: new Date().toISOString(),
				},
			});
		}),

	publishArtifact: protectedProcedure
		.input(publishArtifactInput)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const artifact = await db.query.artifacts.findFirst({
				where: and(
					eq(artifacts.id, input.artifactId),
					eq(artifacts.organizationId, organizationId),
				),
				columns: {
					id: true,
					kind: true,
					title: true,
					body: true,
					markdown: true,
					blobPathname: true,
					mediaType: true,
					createdByUserId: true,
					createdAt: true,
				},
			});

			if (!artifact) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Artifact not found",
				});
			}

			if (
				artifact.createdByUserId &&
				artifact.createdByUserId !== ctx.session.user.id
			) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You can only publish artifacts you created",
				});
			}

			const title = artifact.title ?? "Shared Rox artifact";
			return createPublicShare({
				organizationId,
				resourceType: "artifact",
				resourceId: artifact.id,
				title,
				createdByUserId: ctx.session.user.id,
				payload: {
					type: "artifact",
					artifact: {
						id: artifact.id,
						kind: artifact.kind,
						title,
						body: artifact.body,
						markdown: artifact.markdown,
						blobPathname: artifact.blobPathname,
						mediaType: artifact.mediaType,
						createdAt: serializeDate(artifact.createdAt),
					},
					publishedAt: new Date().toISOString(),
				},
			});
		}),

	getPublic: publicProcedure.input(shareSlugInput).query(async ({ input }) => {
		const share = await db.query.publicShares.findFirst({
			where: and(
				eq(publicShares.slug, input.slug),
				isNull(publicShares.revokedAt),
			),
			columns: {
				id: true,
				resourceType: true,
				resourceId: true,
				slug: true,
				title: true,
				payload: true,
				createdAt: true,
				updatedAt: true,
			},
		});

		if (!share) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Share link not found",
			});
		}

		return { ...share, url: getPublicShareUrl(share.slug) };
	}),

	revokePublic: protectedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const [row] = await dbWs
				.update(publicShares)
				.set({ revokedAt: new Date() })
				.where(
					and(
						eq(publicShares.id, input.id),
						eq(publicShares.organizationId, organizationId),
						eq(publicShares.createdByUserId, ctx.session.user.id),
						isNull(publicShares.revokedAt),
					),
				)
				.returning({ id: publicShares.id });

			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Public share link not found",
				});
			}

			return { success: true };
		}),
} satisfies TRPCRouterRecord;
