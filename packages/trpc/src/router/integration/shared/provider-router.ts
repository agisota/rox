import { db } from "@rox/db/client";
import type { IntegrationConfig, IntegrationProvider } from "@rox/db/schema";
import { integrationConnections } from "@rox/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../utils";

const manualConnectionConfig = z
	.object({
		botUsername: z.string().trim().max(120).optional(),
		defaultChatId: z.string().trim().max(120).optional(),
		guildId: z.string().trim().max(120).optional(),
		defaultChannelId: z.string().trim().max(120).optional(),
		workspaceName: z.string().trim().max(160).optional(),
		botId: z.string().trim().max(160).optional(),
		vaultName: z.string().trim().max(160).optional(),
		account: z.string().trim().max(160).optional(),
		tenantKey: z.string().trim().max(160).optional(),
	})
	.optional();

type ManualConnectionConfigInput = z.infer<typeof manualConnectionConfig>;

function normalizeOptionalString(value: string | null | undefined) {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function buildProviderConfig(
	provider: IntegrationProvider,
	config: ManualConnectionConfigInput,
): IntegrationConfig {
	switch (provider) {
		case "telegram":
			return {
				provider,
				botUsername: normalizeOptionalString(config?.botUsername),
				defaultChatId: normalizeOptionalString(config?.defaultChatId),
			};
		case "discord":
			return {
				provider,
				guildId: normalizeOptionalString(config?.guildId),
				defaultChannelId: normalizeOptionalString(config?.defaultChannelId),
			};
		case "notion":
			return {
				provider,
				workspaceName: normalizeOptionalString(config?.workspaceName),
				botId: normalizeOptionalString(config?.botId),
			};
		case "obsidian":
			return {
				provider,
				vaultName: normalizeOptionalString(config?.vaultName),
			};
		case "fibery":
			return {
				provider,
				account: normalizeOptionalString(config?.account),
			};
		case "lark":
			return {
				provider,
				tenantKey: normalizeOptionalString(config?.tenantKey),
			};
		default:
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `${provider} does not support manual connections`,
			});
	}
}

function inferExternalOrgName(
	provider: IntegrationProvider,
	config: IntegrationConfig,
) {
	switch (provider) {
		case "telegram":
			return config.provider === "telegram" ? config.botUsername : undefined;
		case "discord":
			return config.provider === "discord" ? config.guildId : undefined;
		case "notion":
			return config.provider === "notion" ? config.workspaceName : undefined;
		case "obsidian":
			return config.provider === "obsidian" ? config.vaultName : undefined;
		case "fibery":
			return config.provider === "fibery" ? config.account : undefined;
		case "lark":
			return config.provider === "lark" ? config.tenantKey : undefined;
		default:
			return undefined;
	}
}

/**
 * Builds the standard connection router for an integration provider:
 * `getConnection` (member) + `connect`/`disconnect` (admin). Connections are
 * org-scoped with optional per-workspace scoping (`workspaceId`); omitting
 * `workspaceId` targets the org-level connection.
 *
 * Mirrors the hand-written Slack/Linear routers so each provider vertical only
 * adds provider-specific procedures on top of this baseline.
 */
export function createProviderConnectionRouter(provider: IntegrationProvider) {
	const scope = z.object({
		organizationId: z.uuid(),
		workspaceId: z.uuid().nullish(),
	});
	const connectInput = scope.extend({
		accessToken: z.string().trim().max(8192).optional(),
		externalOrgId: z.string().trim().max(255).optional(),
		externalOrgName: z.string().trim().max(255).optional(),
		config: manualConnectionConfig,
	});

	const workspaceFilter = (workspaceId: string | null | undefined) =>
		workspaceId
			? eq(integrationConnections.workspaceId, workspaceId)
			: isNull(integrationConnections.workspaceId);

	return {
		getConnection: protectedProcedure
			.input(scope)
			.query(async ({ ctx, input }) => {
				await verifyOrgMembership(ctx.session.user.id, input.organizationId);

				const connection = await db.query.integrationConnections.findFirst({
					where: and(
						eq(integrationConnections.organizationId, input.organizationId),
						eq(integrationConnections.provider, provider),
						workspaceFilter(input.workspaceId),
					),
					columns: {
						id: true,
						externalOrgName: true,
						config: true,
						createdAt: true,
					},
				});

				if (!connection) return null;

				return {
					id: connection.id,
					externalOrgName: connection.externalOrgName,
					config: connection.config,
					connectedAt: connection.createdAt,
				};
			}),

		connect: protectedProcedure
			.input(connectInput)
			.mutation(async ({ ctx, input }) => {
				await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

				const connection = await db.query.integrationConnections.findFirst({
					where: and(
						eq(integrationConnections.organizationId, input.organizationId),
						eq(integrationConnections.provider, provider),
						workspaceFilter(input.workspaceId),
					),
				});
				const accessToken =
					normalizeOptionalString(input.accessToken) ?? connection?.accessToken;

				if (!accessToken) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Access token is required for a new connection",
					});
				}

				const config = buildProviderConfig(provider, input.config);
				const externalOrgName =
					normalizeOptionalString(input.externalOrgName) ??
					inferExternalOrgName(provider, config) ??
					connection?.externalOrgName ??
					null;
				const externalOrgId =
					normalizeOptionalString(input.externalOrgId) ??
					connection?.externalOrgId ??
					null;

				if (connection) {
					const [updated] = await db
						.update(integrationConnections)
						.set({
							connectedByUserId: ctx.session.user.id,
							accessToken,
							externalOrgId,
							externalOrgName,
							config,
							disconnectedAt: null,
							disconnectReason: null,
						})
						.where(eq(integrationConnections.id, connection.id))
						.returning({
							id: integrationConnections.id,
							externalOrgName: integrationConnections.externalOrgName,
							config: integrationConnections.config,
							createdAt: integrationConnections.createdAt,
						});

					if (!updated) {
						throw new TRPCError({
							code: "INTERNAL_SERVER_ERROR",
							message: "Failed to update integration connection",
						});
					}

					return {
						id: updated.id,
						externalOrgName: updated.externalOrgName,
						config: updated.config,
						connectedAt: updated.createdAt,
					};
				}

				const [created] = await db
					.insert(integrationConnections)
					.values({
						organizationId: input.organizationId,
						workspaceId: input.workspaceId ?? null,
						connectedByUserId: ctx.session.user.id,
						provider,
						accessToken,
						externalOrgId,
						externalOrgName,
						config,
					})
					.returning({
						id: integrationConnections.id,
						externalOrgName: integrationConnections.externalOrgName,
						config: integrationConnections.config,
						createdAt: integrationConnections.createdAt,
					});

				if (!created) {
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: "Failed to create integration connection",
					});
				}

				return {
					id: created.id,
					externalOrgName: created.externalOrgName,
					config: created.config,
					connectedAt: created.createdAt,
				};
			}),

		disconnect: protectedProcedure
			.input(scope)
			.mutation(async ({ ctx, input }) => {
				await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

				const result = await db
					.delete(integrationConnections)
					.where(
						and(
							eq(integrationConnections.organizationId, input.organizationId),
							eq(integrationConnections.provider, provider),
							workspaceFilter(input.workspaceId),
						),
					)
					.returning({ id: integrationConnections.id });

				if (result.length === 0) {
					return { success: false as const, error: "No connection found" };
				}

				return { success: true as const };
			}),
	};
}
