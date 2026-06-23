/**
 * Decide how a verification token's `identifier` scopes to the invitation being
 * accepted.
 *
 * - Modern links (minted by `generateMagicTokenForInvite`) key the verification
 *   by `invitationId`, so an exact identifier match binds the token to exactly
 *   one invitation. This is always safe to accept.
 * - Legacy links (pre-#2841, still possibly in-flight within their 7-day expiry)
 *   key the verification by the invitee email. An email-keyed token is
 *   many-to-one: it matches every invitation sharing that email, which would
 *   allow a token minted for one invitation to be replayed against a different
 *   pending invitation to the same email (e.g. a second org). For that path the
 *   caller MUST additionally confirm the email maps to a single pending
 *   invitation that is the one being accepted ("legacy-unambiguous").
 */
export function classifyVerificationScope({
	verificationIdentifier,
	invitationId,
	invitationEmail,
}: {
	verificationIdentifier: string;
	invitationId: string;
	invitationEmail: string;
}): "invitation" | "legacy-email" | "mismatch" {
	if (verificationIdentifier === invitationId) {
		return "invitation";
	}
	if (verificationIdentifier.toLowerCase() === invitationEmail.toLowerCase()) {
		return "legacy-email";
	}
	return "mismatch";
}
