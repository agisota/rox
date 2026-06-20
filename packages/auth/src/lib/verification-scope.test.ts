import { describe, expect, it } from "bun:test";
import { classifyVerificationScope } from "./verification-scope";

const INVITATION_A = "11111111-1111-4111-8111-111111111111";
const INVITATION_B = "22222222-2222-4222-8222-222222222222";
const EMAIL = "invitee@example.com";

describe("classifyVerificationScope", () => {
	it("binds a modern token (identifier = invitationId) to that invitation", () => {
		expect(
			classifyVerificationScope({
				verificationIdentifier: INVITATION_A,
				invitationId: INVITATION_A,
				invitationEmail: EMAIL,
			}),
		).toBe("invitation");
	});

	it("treats an email-keyed token as the legacy path (backward compat)", () => {
		expect(
			classifyVerificationScope({
				verificationIdentifier: EMAIL,
				invitationId: INVITATION_A,
				invitationEmail: EMAIL,
			}),
		).toBe("legacy-email");
	});

	it("matches legacy email identifiers case-insensitively", () => {
		expect(
			classifyVerificationScope({
				verificationIdentifier: "Invitee@Example.com",
				invitationId: INVITATION_A,
				invitationEmail: EMAIL,
			}),
		).toBe("legacy-email");
	});

	it("rejects a modern token minted for a different invitation (no cross-invitation replay)", () => {
		// Token keyed to invitation A (a UUID) can never satisfy the email branch
		// for invitation B, so submitting invitationId=B with A's token is a mismatch.
		expect(
			classifyVerificationScope({
				verificationIdentifier: INVITATION_A,
				invitationId: INVITATION_B,
				invitationEmail: EMAIL,
			}),
		).toBe("mismatch");
	});

	it("classifies an unrelated identifier as a mismatch", () => {
		expect(
			classifyVerificationScope({
				verificationIdentifier: "someone-else@other.com",
				invitationId: INVITATION_A,
				invitationEmail: EMAIL,
			}),
		).toBe("mismatch");
	});
});
