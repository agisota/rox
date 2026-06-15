import { db, dbWs } from "@rox/db/client";
import {
	agentSources,
	integrationConnections,
	v2Projects,
} from "@rox/db/schema";
import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { decryptSecret, encryptSecret } from "../../lib/crypto";
import { protectedProcedure } from "../../trpc";
import { verifyOrgAdmin, verifyOrgMembership } from "../integration/utils";
import {
	agentSourceIdSchema,
	createAgentSourceSchema,
	listAgentSourcesSchema,
	setAgentSourceStatusSchema,
	updateAgentSourceSchema,
} from "./schema";

/**
 * Column projection for client-facing reads. Deliberately omits
 * `encryptedConfig` so credentials never leave the server through
 * `list`/`get`/`create`/`update`/`setStatus` (the `integration.list` pattern).
 *
 * Exported so tests can assert the credential-discipline invariant
 * (`encryptedConfig` must never appear in this projection).
 */
export const publicSelect = {
	id: agentSources.id,
	organizationId: agentSources.organizationId,
	v2ProjectId: agentSources.v2ProjectId,
	ownerUserId: agentSources.ownerUserId,
	slug: agentSources.slug,
	name: agentSources.name,
	description: agentSources.description,
	kind: agentSources.kind,
	status: agentSources.status,
	integrationConnectionId: agentSources.integrationConnectionId,
	config: agentSources.config,
	capabilities: agentSources.capabilities,
	endpointUrl: agentSources.endpointUrl,
	version: agentSources.version,
	createdAt: agentSources.createdAt,
	updatedAt: agentSources.updatedAt,
} as const;

async function verifyProjectInOrg(
	organizationId: string,
	projectId: string,
): Promise<void> {
	const [project] = await db
		.select({ id: v2Projects.id })
		.from(v2Projects)
		.where(
			and(
				eq(v2Projects.id, projectId),
				eq(v2Projects.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!project) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Project not found in this organization",
		});
	}
}

async function verifyIntegrationConnectionInOrg(
	organizationId: string,
	connectionId: string,
): Promise<void> {
	const [connection] = await db
		.select({ id: integrationConnections.id })
		.from(integrationConnections)
		.where(
			and(
				eq(integrationConnections.id, connectionId),
				eq(integrationConnections.organizationId, organizationId),
			),
		)
		.limit(1);

	if (!connection) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Integration connection not found in this organization",
		});
	}
}

type AgentSourceReferenceInput = {
	organizationId: string;
	v2ProjectId?: string | null;
	integrationConnectionId?: string | null;
};

async function verifyReferencedRowsInOrg(
	input: AgentSourceReferenceInput,
): Promise<void> {
	if (input.v2ProjectId) {
		await verifyProjectInOrg(input.organizationId, input.v2ProjectId);
	}
	if (input.integrationConnectionId) {
		await verifyIntegrationConnectionInOrg(
			input.organizationId,
			input.integrationConnectionId,
		);
	}
}

export const agentSourceRouter = {
	list: protectedProcedure
		.input(listAgentSourcesSchema)
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const where = input.v2ProjectId
				? and(
						eq(agentSources.organizationId, input.organizationId),
						eq(agentSources.v2ProjectId, input.v2ProjectId),
					)
				: eq(agentSources.organizationId, input.organizationId);

			return db
				.select(publicSelect)
				.from(agentSources)
				.where(where)
				.orderBy(desc(agentSources.createdAt));
		}),

	get: protectedProcedure
		.input(agentSourceIdSchema)
		.query(async ({ ctx, input }) => {
			await verifyOrgMembership(ctx.session.user.id, input.organizationId);

			const [row] = await db
				.select(publicSelect)
				.from(agentSources)
				.where(
					and(
						eq(agentSources.id, input.id),
						eq(agentSources.organizationId, input.organizationId),
					),
				)
				.limit(1);

			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Agent source not found in this organization",
				});
			}

			return row;
		}),

	create: protectedProcedure
		.input(createAgentSourceSchema)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);
			await verifyReferencedRowsInOrg(input);

			const encryptedConfig = input.credentials
				? encryptSecret(JSON.stringify(input.credentials))
				: null;

			const [created] = await dbWs
				.insert(agentSources)
				.values({
					organizationId: input.organizationId,
					v2ProjectId: input.v2ProjectId ?? null,
					ownerUserId: ctx.session.user.id,
					name: input.name,
					slug: input.slug,
					kind: input.kind,
					description: input.description ?? null,
					endpointUrl: input.endpointUrl ?? null,
					integrationConnectionId: input.integrationConnectionId ?? null,
					config: input.config ?? {},
					capabilities: input.capabilities ?? [],
					version: input.version ?? null,
					encryptedConfig,
				})
				.returning(publicSelect);

			return created;
		}),

	update: protectedProcedure
		.input(updateAgentSourceSchema)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);
			await verifyReferencedRowsInOrg(input);

			const updates: Partial<typeof agentSources.$inferInsert> = {};
			if (input.name !== undefined) updates.name = input.name;
			if (input.slug !== undefined) updates.slug = input.slug;
			if (input.kind !== undefined) updates.kind = input.kind;
			if (input.description !== undefined)
				updates.description = input.description;
			if (input.endpointUrl !== undefined)
				updates.endpointUrl = input.endpointUrl;
			if (input.integrationConnectionId !== undefined)
				updates.integrationConnectionId = input.integrationConnectionId;
			if (input.config !== undefined) updates.config = input.config;
			if (input.capabilities !== undefined)
				updates.capabilities = input.capabilities;
			if (input.version !== undefined) updates.version = input.version;
			// Re-encrypt credentials whenever a new map is supplied.
			if (input.credentials !== undefined)
				updates.encryptedConfig = encryptSecret(
					JSON.stringify(input.credentials),
				);

			if (Object.keys(updates).length === 0) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No fields to update",
				});
			}

			const [updated] = await dbWs
				.update(agentSources)
				.set(updates)
				.where(
					and(
						eq(agentSources.id, input.id),
						eq(agentSources.organizationId, input.organizationId),
					),
				)
				.returning(publicSelect);

			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Agent source not found in this organization",
				});
			}

			return updated;
		}),

	setStatus: protectedProcedure
		.input(setAgentSourceStatusSchema)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			const [updated] = await dbWs
				.update(agentSources)
				.set({ status: input.status })
				.where(
					and(
						eq(agentSources.id, input.id),
						eq(agentSources.organizationId, input.organizationId),
					),
				)
				.returning(publicSelect);

			if (!updated) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Agent source not found in this organization",
				});
			}

			return updated;
		}),

	delete: protectedProcedure
		.input(agentSourceIdSchema)
		.mutation(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			const [deleted] = await dbWs
				.delete(agentSources)
				.where(
					and(
						eq(agentSources.id, input.id),
						eq(agentSources.organizationId, input.organizationId),
					),
				)
				.returning({ id: agentSources.id });

			return { success: !!deleted };
		}),

	/**
	 * Server-side read-path for the runtime: decrypts `encryptedConfig` and
	 * returns the credential map. Credentials are NEVER exposed via `list`/`get`
	 * — only this explicit, admin-gated procedure surfaces them, and it
	 * must not be wired into general client list views.
	 */
	getDecryptedConfig: protectedProcedure
		.input(agentSourceIdSchema)
		.query(async ({ ctx, input }) => {
			await verifyOrgAdmin(ctx.session.user.id, input.organizationId);

			const [row] = await db
				.select({
					id: agentSources.id,
					encryptedConfig: agentSources.encryptedConfig,
				})
				.from(agentSources)
				.where(
					and(
						eq(agentSources.id, input.id),
						eq(agentSources.organizationId, input.organizationId),
					),
				)
				.limit(1);

			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Agent source not found in this organization",
				});
			}

			if (!row.encryptedConfig) {
				return { id: row.id, credentials: null };
			}

			const credentials = JSON.parse(
				decryptSecret(row.encryptedConfig),
			) as Record<string, string>;

			return { id: row.id, credentials };
		}),
} satisfies TRPCRouterRecord;
