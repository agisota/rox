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
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../../trpc";
import {
	requireActiveOrgId,
	requireActiveOrgMembership,
} from "../utils/active-org";
import {
	buildSelfManagedHostValues,
	SELF_MANAGED_HOST_PROTOCOLS,
} from "./self-managed";

// Managed (provider-backed) hosts the provision procedure can create. `self`
// is intentionally excluded: it now has a provisioner adapter
// (RoxSelfProvisioner — one-click host on our own Docker box, gated by
// ROX_SELF_DOCKER_HOST), but enabling it server-side here also requires a
// published host-service image, so it stays dormant until both are provided.
const MANAGED_PROVIDERS = [
	"daytona",
	"modal",
	"e2b",
] as const satisfies ReadonlyArray<ProvisionProvider>;

const PROVIDER_LABELS: Record<ProvisionProvider, string> = {
	daytona: "Daytona",
	modal: "Modal",
	e2b: "E2B",
	self: "Сервер Rox (удалённый)",
};

// Reject whitespace and ASCII control chars (0x00-0x1f, 0x7f); real API tokens
// use none. Checked via char codes so no control chars appear in a regex.
function isPrintableToken(value: string): boolean {
	for (const char of value) {
		const code = char.charCodeAt(0);
		if (code <= 0x1f || code === 0x7f) return false;
	}
	return !/\s/.test(value);
}

// Shape guard for a per-request provider credential. Intentionally generic
// (provider key formats differ and drift) — reject only obviously-invalid
// values: empty/oversized, or containing whitespace/control characters that no
// real API token uses. The trimmed value is passed straight to the provisioner
// factory and never logged.
const providerApiKeySchema = z
	.string()
	.trim()
	.min(8, "Provider API key looks too short")
	.max(512, "Provider API key looks too long")
	.refine(isPrintableToken, "Provider API key contains invalid characters");

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
	 * row plus an owner `v2_users_hosts` membership. Free by default (no
	 * paid-plan gate); active org membership is still required.
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
				// Per-request provider credential supplied by the client (e.g. the
				// desktop Add Host dialog persists keys in local storage). When
				// present it overrides the server env key, so a user can provision
				// with only a locally-saved key. Shape-validated, never logged. Falls
				// back to the server env credential when omitted.
				providerApiKey: providerApiKeySchema.optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// #34.1: managed remote hosts/sandboxes are free by default — no
			// paid-plan gate. Active org membership is still required. (No
			// subscription join needed; swap back to the *WithSubscription helper
			// only if a future free|subscriber perk gates on plan here.)
			const organizationId = await requireActiveOrgMembership(ctx);

			let provisioner: ReturnType<typeof getHostProvisioner>;
			try {
				// Prefer the caller-supplied key (locally-saved provider credential),
				// falling back to the server env credential inside the factory.
				provisioner = getHostProvisioner(input.provider, {
					apiKey: input.providerApiKey,
				});
			} catch (err) {
				if (err instanceof MissingProvisionerCredentialsError) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: `Provider "${input.provider}" is not configured on this server. Save its API key in the Add Host dialog or set it on the server.`,
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
	 * Register a user-managed remote host or sandbox endpoint. This is the
	 * no-spend "add server" path: it records connection metadata for a host the
	 * user already controls and never calls a live provisioner.
	 */
	addServer: protectedProcedure
		.input(
			z.object({
				name: z
					.string()
					.max(120)
					.transform((value) => value.trim())
					.pipe(z.string().min(1, "Host name cannot be empty")),
				host: z
					.string()
					.max(255)
					.transform((value) => value.trim())
					.pipe(z.string().min(1, "Host cannot be empty")),
				port: z.number().int().min(1).max(65_535),
				protocol: z.enum(SELF_MANAGED_HOST_PROTOCOLS),
				kind: z.enum(v2ManagedHostKindValues),
				ttlMs: z.number().int().positive().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const organizationId = await requireActiveOrgMembership(ctx);
			const hostValues = buildSelfManagedHostValues(input);

			const result = await dbWs.transaction(async (tx) => {
				const [host] = await tx
					.insert(v2Hosts)
					.values({
						organizationId,
						machineId: hostValues.machineId,
						name: hostValues.name,
						kind: hostValues.kind,
						provider: hostValues.provider,
						port: hostValues.port,
						protocol: hostValues.protocol,
						expiresAt: hostValues.expiresAt,
						createdByUserId: ctx.session.user.id,
					})
					.onConflictDoNothing({
						target: [v2Hosts.organizationId, v2Hosts.machineId],
					})
					.returning();

				if (!host) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "A host with this hostname already exists",
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
