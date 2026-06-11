import { db, dbWs } from "@rox/db/client";
import {
	v2Clients,
	v2ClientTypeValues,
	v2Hosts,
	v2UsersHosts,
} from "@rox/db/schema";
import { parseHostRoutingKey } from "@rox/shared/host-routing";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { jwtProcedure, protectedProcedure } from "../../trpc";

export const hostRouter = {
	list: jwtProcedure
		.input(z.object({ organizationId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}

			const rows = await db
				.select({
					machineId: v2Hosts.machineId,
					name: v2Hosts.name,
					isOnline: v2Hosts.isOnline,
					organizationId: v2Hosts.organizationId,
					port: v2Hosts.port,
					protocol: v2Hosts.protocol,
					kind: v2Hosts.kind,
					provider: v2Hosts.provider,
					expiresAt: v2Hosts.expiresAt,
				})
				.from(v2Hosts)
				.innerJoin(
					v2UsersHosts,
					and(
						eq(v2UsersHosts.organizationId, v2Hosts.organizationId),
						eq(v2UsersHosts.hostId, v2Hosts.machineId),
					),
				)
				.where(
					and(
						eq(v2Hosts.organizationId, input.organizationId),
						eq(v2UsersHosts.userId, ctx.userId),
					),
				);

			return rows.map((row) => ({
				id: row.machineId,
				name: row.name,
				online: row.isOnline,
				organizationId: row.organizationId,
				port: row.port,
				protocol: row.protocol,
				kind: row.kind,
				provider: row.provider,
				expiresAt: row.expiresAt,
			}));
		}),

	ensure: jwtProcedure
		.input(
			z.object({
				organizationId: z.string().uuid(),
				machineId: z.string().min(1),
				name: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			if (!ctx.organizationIds.includes(input.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not a member of this organization",
				});
			}

			const [inserted] = await dbWs
				.insert(v2Hosts)
				.values({
					organizationId: input.organizationId,
					machineId: input.machineId,
					name: input.name,
					createdByUserId: ctx.userId,
				})
				.onConflictDoNothing({
					target: [v2Hosts.organizationId, v2Hosts.machineId],
				})
				.returning();

			const host =
				inserted ??
				(await db.query.v2Hosts.findFirst({
					where: and(
						eq(v2Hosts.organizationId, input.organizationId),
						eq(v2Hosts.machineId, input.machineId),
					),
				}));

			if (!host) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to ensure host",
				});
			}

			if (host.createdByUserId === ctx.userId) {
				await dbWs
					.insert(v2UsersHosts)
					.values({
						organizationId: input.organizationId,
						userId: ctx.userId,
						hostId: host.machineId,
						role: "owner",
					})
					.onConflictDoNothing({
						target: [
							v2UsersHosts.organizationId,
							v2UsersHosts.userId,
							v2UsersHosts.hostId,
						],
					});
			}

			return host;
		}),

	ensureClient: protectedProcedure
		.input(
			z.object({
				machineId: z.string().min(1),
				type: z.enum(v2ClientTypeValues),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.activeOrganizationId;
			if (!organizationId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No active organization selected",
				});
			}

			const userId = ctx.session.user.id;

			const [client] = await dbWs
				.insert(v2Clients)
				.values({
					organizationId,
					userId,
					machineId: input.machineId,
					type: input.type,
				})
				.onConflictDoUpdate({
					target: [
						v2Clients.organizationId,
						v2Clients.userId,
						v2Clients.machineId,
					],
					set: {
						type: input.type,
					},
				})
				.returning();

			if (!client) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Failed to ensure client",
				});
			}

			return client;
		}),

	checkAccess: jwtProcedure
		.input(z.object({ hostId: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const parsed = parseHostRoutingKey(input.hostId);
			if (!parsed) return { allowed: false };
			if (!ctx.organizationIds.includes(parsed.organizationId)) {
				return { allowed: false };
			}
			const [row] = await db
				.select({ hostId: v2UsersHosts.hostId })
				.from(v2UsersHosts)
				.where(
					and(
						eq(v2UsersHosts.userId, ctx.userId),
						eq(v2UsersHosts.organizationId, parsed.organizationId),
						eq(v2UsersHosts.hostId, parsed.machineId),
					),
				)
				.limit(1);

			// #34.1: no paid-plan gate. `allowed` is true iff the user holds a
			// host-level `v2_users_hosts` link for this exact host (not merely org
			// membership). `paidPlan` is no longer returned; the relay reads only
			// `allowed`. Keep these notes in sync with any later auth/relay refactor.
			return { allowed: !!row };
		}),

	setOnline: jwtProcedure
		.input(
			z.object({
				hostId: z.string().min(1),
				isOnline: z.boolean(),
				// Reachable endpoint reported by the relay for remote tunnels.
				// Omitted for local "this device" hosts.
				port: z.number().int().positive().max(65535).optional(),
				protocol: z.string().min(1).max(32).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const parsed = parseHostRoutingKey(input.hostId);
			if (!parsed) {
				throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid hostId" });
			}
			if (!ctx.organizationIds.includes(parsed.organizationId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "No access to this host",
				});
			}

			const access = await db.query.v2UsersHosts.findFirst({
				where: and(
					eq(v2UsersHosts.userId, ctx.userId),
					eq(v2UsersHosts.organizationId, parsed.organizationId),
					eq(v2UsersHosts.hostId, parsed.machineId),
				),
				columns: { hostId: true },
			});
			if (!access) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "No access to this host",
				});
			}

			await db
				.update(v2Hosts)
				.set({
					isOnline: input.isOnline,
					...(input.port !== undefined ? { port: input.port } : {}),
					...(input.protocol !== undefined ? { protocol: input.protocol } : {}),
				})
				.where(
					and(
						eq(v2Hosts.organizationId, parsed.organizationId),
						eq(v2Hosts.machineId, parsed.machineId),
					),
				);
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
