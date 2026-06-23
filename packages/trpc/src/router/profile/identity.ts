import { db, dbWs } from "@rox/db/client";
import { accounts, userProfiles } from "@rox/db/schema";
import {
	canClaimHandle,
	missingHandleProviders,
	REQUIRED_HANDLE_PROVIDERS,
	validateHandle,
} from "@rox/shared/username";
import { TRPCError, type TRPCRouterRecord } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { provisionIdentity } from "../../lib/identity/provisionIdentity";
import { renameHandle } from "../../lib/identity/renameHandle";
import { protectedProcedure } from "../../trpc";
import { requireActiveOrgId } from "../utils/active-org";

/**
 * Human-readable copy for each `validateHandle` failure code, returned to the
 * client so the UI never has to re-derive validation messaging.
 */
const HANDLE_ERROR_MESSAGES = {
	empty: "Введите имя пользователя.",
	too_short: "Имя пользователя должно быть не короче 4 символов.",
	too_long: "Имя пользователя должно быть не длиннее 16 символов.",
	invalid_chars: "Разрешены только строчные латинские буквы, цифры и «_».",
	reserved: "Это имя зарезервировано. Выберите другое.",
} as const;

/**
 * The `provider_id` values better-auth writes for password / email accounts.
 * They're never part of the OAuth-link gate, so we hide them from the connected
 * accounts list (the user's email already lives on the account elsewhere).
 */
const CREDENTIAL_PROVIDER_IDS = new Set(["credential", "email"]);

type ConnectedAccount = {
	/** better-auth `auth.accounts.provider_id` (e.g. "github", "telegram"). */
	providerId: string;
	/** Upstream account id (`auth.accounts.account_id`). */
	providerAccountId: string;
	/** Provider's username, denormalized for the registration provider only. */
	displayUsername: string | null;
	/** Provider avatar, denormalized for the registration provider only. */
	providerAvatarUrl: string | null;
	/** True when this is the provider the user originally registered through. */
	isRegistrationProvider: boolean;
};

/**
 * Identity / "Профиль" settings surface (ROX-522 Phase 2.2).
 *
 * Server-authoritative: the connected-accounts list, the handle-claim gate, and
 * uniqueness are all resolved against the database here. The client mirrors the
 * gate for UX only and may never bypass it.
 */
export const identityRouter = {
	/**
	 * Everything the Identity settings panel needs in one round-trip: the user's
	 * linked OAuth accounts, their current handle (if any), and whether the
	 * handle-claim gate is satisfied.
	 */
	getMine: protectedProcedure.query(async ({ ctx }) => {
		const userId = ctx.session.user.id;

		const [profile, linkedAccounts] = await Promise.all([
			db.query.userProfiles.findFirst({
				where: eq(userProfiles.userId, userId),
			}),
			db.query.accounts.findMany({
				where: eq(accounts.userId, userId),
				columns: { providerId: true, accountId: true },
			}),
		]);

		const registrationProvider = profile?.registrationProvider ?? null;

		const connectedAccounts: ConnectedAccount[] = linkedAccounts
			.filter((account) => !CREDENTIAL_PROVIDER_IDS.has(account.providerId))
			.map((account) => {
				const isRegistrationProvider =
					account.providerId === registrationProvider;
				return {
					providerId: account.providerId,
					providerAccountId: account.accountId,
					// Only the registration provider's identity is denormalized onto
					// `user_profiles`; other links show provider + account id only.
					displayUsername: isRegistrationProvider
						? (profile?.displayUsername ?? null)
						: null,
					providerAvatarUrl: isRegistrationProvider
						? (profile?.providerAvatarUrl ?? null)
						: null,
					isRegistrationProvider,
				};
			});

		const linkedProviderIds = connectedAccounts.map(
			(account) => account.providerId,
		);

		return {
			handle: profile?.handle ?? null,
			registrationProvider,
			connectedAccounts,
			/** Providers still required before a handle can be claimed. */
			missingProviders: missingHandleProviders(linkedProviderIds),
			/** Server's authoritative gate decision (UI mirrors, never trusts client). */
			canClaimHandle: canClaimHandle(linkedProviderIds),
			requiredProviders: [...REQUIRED_HANDLE_PROVIDERS],
		};
	}),

	/**
	 * Claim (or change) the current user's custom handle. Server-authoritative on
	 * three axes: shape (`validateHandle`), gating (linked providers), and
	 * uniqueness (`user_profiles.handle` unique index, surfaced as a friendly
	 * "занято" error).
	 */
	claimHandle: protectedProcedure
		.input(z.object({ handle: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const userId = ctx.session.user.id;

			// 1. Shape / reserved-word validation (mirrors the client check).
			const validation = validateHandle(input.handle);
			if (!validation.ok || !validation.normalized) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: validation.error
						? HANDLE_ERROR_MESSAGES[validation.error]
						: "Недопустимое имя пользователя.",
				});
			}
			const handle = validation.normalized;

			// 2. Gating: re-derive linked providers server-side. Never trust the
			// client's view of which accounts are connected.
			const linkedAccounts = await db.query.accounts.findMany({
				where: eq(accounts.userId, userId),
				columns: { providerId: true },
			});
			const linkedProviderIds = linkedAccounts
				.map((account) => account.providerId)
				.filter((providerId) => !CREDENTIAL_PROVIDER_IDS.has(providerId));

			if (!canClaimHandle(linkedProviderIds)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message:
						"Привяжите требуемые аккаунты, чтобы выбрать имя пользователя.",
				});
			}

			// 3. Uniqueness: explicit pre-check for a friendly error, then rely on the
			// unique index as the race-safe source of truth.
			const existing = await db.query.userProfiles.findFirst({
				where: eq(userProfiles.handle, handle),
				columns: { userId: true },
			});
			if (existing && existing.userId !== userId) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "Это имя пользователя уже занято.",
				});
			}

			// 4. Identity is org-stamped (DQ3) for Electric shapes; the active org is
			// the stamp. Require one so provisioning has an org to write under.
			const organizationId = requireActiveOrgId(ctx);

			// Read the CURRENT handle to decide provision (first claim) vs rename.
			const current = await db.query.userProfiles.findFirst({
				where: eq(userProfiles.userId, userId),
				columns: { handle: true },
			});

			try {
				if (current?.handle && current.handle !== handle) {
					// Handle CHANGE → atomic rename + 90-day alias (DQ4).
					await renameHandle({
						userId,
						fromHandle: current.handle,
						toHandle: handle,
						organizationId,
					});
				} else if (!current?.handle) {
					// FIRST claim → provision identity (I1: the first real caller).
					await dbWs.transaction(async (tx) => {
						await tx
							.insert(userProfiles)
							.values({ userId, handle })
							.onConflictDoUpdate({
								target: userProfiles.userId,
								set: { handle },
							});
						await provisionIdentity({ userId, handle, organizationId }, tx);
					});
				}
				// else: same handle re-submitted → no-op.

				return { handle };
			} catch (error) {
				// Dual-index trap: a same-org dup hits comms_addresses_org_kind_value_uniq;
				// a cross-org dup hits comms_addresses_kind_value_primary_uniq; the handle
				// table hits identity_handles_normalized_uniq. Map ALL to CONFLICT.
				if (
					error instanceof Error &&
					/unique|duplicate|занято|reserved/i.test(error.message)
				) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "Это имя пользователя уже занято.",
					});
				}
				throw error;
			}
		}),
} satisfies TRPCRouterRecord;
