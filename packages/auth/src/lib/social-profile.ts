import { db } from "@rox/db/client";
import { type RegistrationProvider, userProfiles } from "@rox/db/schema";

/**
 * Cached provider-identity fields denormalized onto `auth.user_profiles`
 * (ROX-522). Sourced from the provider's user-info payload at sign-up.
 */
export interface SocialProfileIdentity {
	userId: string;
	registrationProvider: RegistrationProvider;
	providerAccountId: string;
	displayUsername: string | null;
	providerAvatarUrl: string | null;
}

/**
 * Upsert the cached provider identity onto `user_profiles`.
 *
 * `registration_provider` is treated as first-touch: it is only written when
 * the profile row is created. On a subsequent provider link (or a repeat
 * sign-in) we refresh the denormalized username/avatar but never overwrite the
 * original `registration_provider` — matching the schema contract in
 * `profiles.ts` ("provider the user *originally* registered through").
 *
 * Best-effort and self-contained: callers run this outside the critical
 * sign-in path and swallow/log failures, so a profile write must never block
 * authentication.
 */
export async function upsertSocialProfile(
	identity: SocialProfileIdentity,
): Promise<void> {
	await db
		.insert(userProfiles)
		.values({
			userId: identity.userId,
			registrationProvider: identity.registrationProvider,
			providerAccountId: identity.providerAccountId,
			displayUsername: identity.displayUsername,
			providerAvatarUrl: identity.providerAvatarUrl,
		})
		.onConflictDoUpdate({
			target: userProfiles.userId,
			set: {
				// Refresh the denormalized provider username/avatar on re-link, but
				// never overwrite `registration_provider` (first-touch only).
				providerAccountId: identity.providerAccountId,
				displayUsername: identity.displayUsername,
				providerAvatarUrl: identity.providerAvatarUrl,
			},
		});
}
