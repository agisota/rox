import { db, dbWs } from "@rox/db/client";
import { v2ManagedHostKindValues, v2UsersHostRoleValues } from "@rox/db/enums";
import { members, v2Hosts, v2UsersHosts } from "@rox/db/schema";
import { getCurrentTxid } from "@rox/db/utils";
import {
	DEFAULT_SANDBOX_TTL_MS,
	getHostProvisioner,
	listAvailableProviders,
	MissingProvisionerCredentialsError,
	ProvisionerError,
	type ProvisionProvider,
} from "@rox/host-provisioner";
import { isActiveSubscriptionStatus, isPaidPlan } from "@rox/shared/billing";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import {
	requireActiveOrgId,
	requireActiveOrgMembershipWithSubscription,
} from "../utils/active-org";

// Managed (provider-backed) hosts the provision procedure can create. `self`
// (user-run `rox deploy`) is intentionally excluded — it is not provisioned
// server-side.
const MANAGED_PROVIDERS = [
	"daytona",
	"modal",
	"e2b",
] as const satisfies ReadonlyArray<ProvisionProvider>;

const PROVIDER_LABELS: Record<ProvisionProvider, string> = {
	daytona: "Daytona",
	modal: "Modal",
	e2b: "E2B",
};

async function requireHostOwner(
	userId: string,
	machineId: string,
	organizationId: string,
) {
	const host = await db.query.v2Hosts.findFirst({
		where: and(
			eq(v2Hosts.organizationId, organizationId),
			eq(v2Hosts.machineId, machineId),
		),
		columns: { machineId: true, organizationId: true, createdByUserId: true },
	});

	if (!host) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Host not found in this organization",
		});
	}

	const access = await db.query.v2UsersHosts.findFirst({
		where: and(
			eq(v2UsersHosts.organizationId, organizationId),
			eq(v2UsersHosts.userId, userId),
			eq(v2UsersHosts.hostId, machineId),
		),
		columns: { role: true },
	});

	if (!access || access.role !== "owner") {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Only host owners can change membership",
		});
	}

	return host;
}

async function requireOrgMember(userId: string, organizationId: string) {
	const member = await db.query.members.findFirst({
		where: and(
			eq(members.userId, userId),
			eq(members.organizationId, organizationId),
		),
		columns: { id: true },
	});

	if (!member) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "User is not a member of this organization",
		});
	}
}

export const v2HostRouter = {
	list: protectedProcedure.query(async ({ ctx }) => {
		const organizationId = requireActiveOrgId(ctx);
		return db
			.select({
				machineId: v2Hosts.machineId,
				name: v2Hosts.name,
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
					eq(v2Hosts.organizationId, organizationId),
					eq(v2UsersHosts.userId, ctx.session.user.id),
				),
			);
	}),

	rename: protectedProcedure
		.input(
			z.object({
				hostId: z.string().min(1),
				name: z
					.string()
					.max(120)
					.transform((value) => value.trim())
					.pipe(z.string().min(1, "Host name cannot be empty")),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			await requireHostOwner(ctx.session.user.id, input.hostId, organizationId);

			const txid = await dbWs.transaction(async (tx) => {
				const [updated] = await tx
					.update(v2Hosts)
					.set({ name: input.name })
					.where(
						and(
							eq(v2Hosts.organizationId, organizationId),
							eq(v2Hosts.machineId, input.hostId),
						),
					)
					.returning({ machineId: v2Hosts.machineId });
				if (!updated) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Host not found in this organization",
					});
				}
				return await getCurrentTxid(tx);
			});

			return { success: true, txid };
		}),

	addMember: protectedProcedure
		.input(
			z.object({
				hostId: z.string().min(1),
				userId: z.string().uuid(),
				role: z.enum(v2UsersHostRoleValues).optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			await requireHostOwner(ctx.session.user.id, input.hostId, organizationId);
			await requireOrgMember(input.userId, organizationId);

			const result = await dbWs.transaction(async (tx) => {
				const [inserted] = await tx
					.insert(v2UsersHosts)
					.values({
						organizationId,
						userId: input.userId,
						hostId: input.hostId,
						role: input.role ?? "member",
					})
					.onConflictDoNothing({
						target: [
							v2UsersHosts.organizationId,
							v2UsersHosts.userId,
							v2UsersHosts.hostId,
						],
					})
					.returning();
				const txid = await getCurrentTxid(tx);
				return { inserted, txid };
			});

			if (!result.inserted) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "User already has access to this host",
				});
			}

			return { ...result.inserted, txid: result.txid };
		}),

	removeMember: protectedProcedure
		.input(
			z.object({
				hostId: z.string().min(1),
				userId: z.string().uuid(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			const host = await requireHostOwner(
				ctx.session.user.id,
				input.hostId,
				organizationId,
			);

			if (host.createdByUserId === input.userId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"This user runs the host service for this device and can't be removed.",
				});
			}

			const txid = await dbWs.transaction(async (tx) => {
				const target = await tx.query.v2UsersHosts.findFirst({
					where: and(
						eq(v2UsersHosts.organizationId, organizationId),
						eq(v2UsersHosts.userId, input.userId),
						eq(v2UsersHosts.hostId, input.hostId),
					),
					columns: { role: true },
				});

				if (!target) {
					return null;
				}

				if (target.role === "owner") {
					const otherOwners = await tx
						.select({ userId: v2UsersHosts.userId })
						.from(v2UsersHosts)
						.where(
							and(
								eq(v2UsersHosts.organizationId, organizationId),
								eq(v2UsersHosts.hostId, input.hostId),
								eq(v2UsersHosts.role, "owner"),
								ne(v2UsersHosts.userId, input.userId),
							),
						)
						.for("update");
					if (otherOwners.length === 0) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "A host must have at least one owner.",
						});
					}
				}

				const [deleted] = await tx
					.delete(v2UsersHosts)
					.where(
						and(
							eq(v2UsersHosts.organizationId, organizationId),
							eq(v2UsersHosts.userId, input.userId),
							eq(v2UsersHosts.hostId, input.hostId),
						),
					)
					.returning({ userId: v2UsersHosts.userId });
				if (!deleted) {
					return null;
				}
				return await getCurrentTxid(tx);
			});

			return { success: true, txid };
		}),

	setMemberRole: protectedProcedure
		.input(
			z.object({
				hostId: z.string().min(1),
				userId: z.string().uuid(),
				role: z.enum(v2UsersHostRoleValues),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			const host = await requireHostOwner(
				ctx.session.user.id,
				input.hostId,
				organizationId,
			);

			if (input.role === "member" && host.createdByUserId === input.userId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"This user runs the host service for this device and must remain an owner.",
				});
			}

			const txid = await dbWs.transaction(async (tx) => {
				const target = await tx.query.v2UsersHosts.findFirst({
					where: and(
						eq(v2UsersHosts.organizationId, organizationId),
						eq(v2UsersHosts.userId, input.userId),
						eq(v2UsersHosts.hostId, input.hostId),
					),
					columns: { role: true },
				});

				if (!target) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "User is not a member of this host",
					});
				}

				if (input.role === "member" && target.role === "owner") {
					const otherOwners = await tx
						.select({ userId: v2UsersHosts.userId })
						.from(v2UsersHosts)
						.where(
							and(
								eq(v2UsersHosts.organizationId, organizationId),
								eq(v2UsersHosts.hostId, input.hostId),
								eq(v2UsersHosts.role, "owner"),
								ne(v2UsersHosts.userId, input.userId),
							),
						)
						.for("update");
					if (otherOwners.length === 0) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: "A host must have at least one owner.",
						});
					}
				}

				const [updated] = await tx
					.update(v2UsersHosts)
					.set({ role: input.role })
					.where(
						and(
							eq(v2UsersHosts.organizationId, organizationId),
							eq(v2UsersHosts.userId, input.userId),
							eq(v2UsersHosts.hostId, input.hostId),
						),
					)
					.returning({ userId: v2UsersHosts.userId });
				if (!updated) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "User is not a member of this host",
					});
				}
				return await getCurrentTxid(tx);
			});

			return { success: true, txid };
		}),

	// Remote Hosts & Sandboxes (remote-hosts epic) ----------------------------

	/** Managed providers and whether each has credentials configured. */
	listProviders: protectedProcedure.query(async () => {
		const available = new Set(listAvailableProviders());
		return MANAGED_PROVIDERS.map((provider) => ({
			id: provider,
			label: PROVIDER_LABELS[provider],
			available: available.has(provider),
		}));
	}),

	/**
	 * Provision a managed remote workspace (persistent) or ephemeral sandbox
	 * (~1h TTL) via the host-provisioner, then atomically insert the `v2_hosts`
	 * row plus an owner `v2_users_hosts` membership. Gated behind the paid plan.
	 */
	provision: protectedProcedure
		.input(
			z.object({
				name: z
					.string()
					.max(120)
					.transform((value) => value.trim())
					.pipe(z.string().min(1, "Host name cannot be empty")),
				kind: z.enum(v2ManagedHostKindValues),
				provider: z.enum(MANAGED_PROVIDERS),
				region: z.string().min(1).max(64).optional(),
				ttlMs: z.number().int().positive().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { organizationId, subscription } =
				await requireActiveOrgMembershipWithSubscription(ctx);

			const paidPlan =
				isPaidPlan(subscription?.plan) &&
				isActiveSubscriptionStatus(subscription?.status);
			if (!paidPlan) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Managed remote hosts and sandboxes require a paid plan.",
				});
			}

			let provisioner: ReturnType<typeof getHostProvisioner>;
			try {
				provisioner = getHostProvisioner(input.provider);
			} catch (err) {
				if (err instanceof MissingProvisionerCredentialsError) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `Provider "${input.provider}" is not configured on this server.`,
					});
				}
				throw err;
			}

			let provisioned: Awaited<ReturnType<typeof provisioner.provision>>;
			try {
				provisioned = await provisioner.provision({
					kind: input.kind,
					ttlMs:
						input.kind === "sandbox"
							? (input.ttlMs ?? DEFAULT_SANDBOX_TTL_MS)
							: undefined,
					region: input.region,
					label: input.name,
				});
			} catch (err) {
				throw new TRPCError({
					code: "BAD_GATEWAY",
					message:
						err instanceof ProvisionerError
							? `Failed to provision host: ${err.message}`
							: "Failed to provision host.",
				});
			}

			try {
				const result = await dbWs.transaction(async (tx) => {
					const [host] = await tx
						.insert(v2Hosts)
						.values({
							organizationId,
							machineId: provisioned.id,
							name: input.name,
							kind: provisioned.kind,
							provider: provisioned.provider,
							port: provisioned.port,
							protocol: provisioned.protocol,
							expiresAt: provisioned.expiresAt
								? new Date(provisioned.expiresAt)
								: null,
							createdByUserId: ctx.session.user.id,
						})
						.onConflictDoNothing({
							target: [v2Hosts.organizationId, v2Hosts.machineId],
						})
						.returning();

					if (!host) {
						throw new TRPCError({
							code: "CONFLICT",
							message: "A host with this id already exists",
						});
					}

					await tx
						.insert(v2UsersHosts)
						.values({
							organizationId,
							userId: ctx.session.user.id,
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

					const txid = await getCurrentTxid(tx);
					return { host, txid };
				});

				return { ...result.host, txid: result.txid };
			} catch (err) {
				// Roll back the external resource so we don't leak paid spend on a
				// host row we failed to persist.
				await provisioner.destroy(provisioned.id).catch(() => {});
				throw err;
			}
		}),

	/**
	 * Destroy a managed host: tear down the provider resource (best effort) and
	 * delete the `v2_hosts` row (memberships cascade via FK). Owners only.
	 */
	destroy: protectedProcedure
		.input(z.object({ hostId: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const organizationId = requireActiveOrgId(ctx);
			await requireHostOwner(ctx.session.user.id, input.hostId, organizationId);

			const row = await db.query.v2Hosts.findFirst({
				where: and(
					eq(v2Hosts.organizationId, organizationId),
					eq(v2Hosts.machineId, input.hostId),
				),
				columns: { provider: true },
			});

			if (row?.provider && row.provider !== "self") {
				try {
					await getHostProvisioner(row.provider).destroy(input.hostId);
				} catch (err) {
					// Don't block removal of the row on provider/credential errors —
					// the resource may already be gone (e.g. expired sandbox).
					if (!(err instanceof MissingProvisionerCredentialsError)) {
						console.error(
							`[v2Host.destroy] provider teardown failed for ${input.hostId}`,
							err,
						);
					}
				}
			}

			const txid = await dbWs.transaction(async (tx) => {
				await tx
					.delete(v2Hosts)
					.where(
						and(
							eq(v2Hosts.organizationId, organizationId),
							eq(v2Hosts.machineId, input.hostId),
						),
					);
				return await getCurrentTxid(tx);
			});

			return { success: true, txid };
		}),
} satisfies TRPCRouterRecord;
