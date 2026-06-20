import "server-only";
import { db } from "@rox/db/client";
import type { RegistrationProvider } from "@rox/db/schema";

/**
 * Public, read-only projection of a Rox user profile for the `@<handle>`
 * namespace (ROX-522 Phase 2).
 *
 * SECURITY: only fields that are safe to expose to anonymous viewers live here.
 * Private columns (`contactEmail` unless the user opted to publish it,
 * `providerAccountId`, OAuth tokens, raw `user.email`) are intentionally NOT
 * projected. The `@<handle>` routes consume this shape directly, so the type is
 * the public contract.
 */
export type PublicProfile = {
	userId: string;
	handle: string;
	displayName: string;
	avatarUrl: string | null;
	/** Provider the user joined Rox through (telegram/yandex/x/github/email). */
	registrationProvider: RegistrationProvider | null;
	/** Provider's own handle (e.g. `@alice` on Telegram), display-only. */
	displayUsername: string | null;
	bio: string | null;
	location: string | null;
	websiteUrl: string | null;
	contactEmail: string | null;
	telegram: string | null;
	max: string | null;
	wechat: string | null;
	twitter: string | null;
};

/**
 * Resolve a public profile by handle. Returns `null` for unknown handles or
 * profiles the owner has not marked public, so callers can `notFound()`.
 *
 * `handle` must already be the bare nickname (no leading `@`).
 */
export async function getPublicProfile(
	handle: string,
): Promise<PublicProfile | null> {
	const profile = await db.query.userProfiles.findFirst({
		where: (userProfiles, { and, eq }) =>
			and(eq(userProfiles.handle, handle), eq(userProfiles.isPublic, true)),
		with: { user: true },
	});

	if (!profile) return null;

	return {
		userId: profile.userId,
		// The query matched on `eq(userProfiles.handle, handle)`, so the matched
		// row's handle is provably this non-null route param.
		handle,
		displayName: profile.displayName ?? profile.user.name,
		avatarUrl:
			profile.avatarUrl ?? profile.providerAvatarUrl ?? profile.user.image,
		registrationProvider: profile.registrationProvider,
		displayUsername: profile.displayUsername,
		bio: profile.bio,
		location: profile.location,
		websiteUrl: profile.websiteUrl,
		contactEmail: profile.contactEmail,
		telegram: profile.telegram,
		max: profile.max,
		wechat: profile.wechat,
		twitter: profile.twitter,
	};
}
