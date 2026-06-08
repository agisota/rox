import { describe, expect, it } from "bun:test";
import { betterAuth } from "better-auth";
import { type MemoryDB, memoryAdapter } from "better-auth/adapters/memory";

/**
 * Integration coverage for the cloud email + password auth flow.
 *
 * These build a self-contained Better Auth instance backed by the in-memory
 * adapter so we can exercise the real sign-up -> sign-in -> session ->
 * sign-out cycle without touching the project Postgres database. The config
 * mirrors `server.ts`: email/password enabled, auto sign-in on, and email
 * verification enforced for the "cloud" shape.
 */

function createTestAuth(options: {
	requireEmailVerification?: boolean;
	onVerificationEmail?: (data: { email: string; url: string }) => void;
}) {
	// The in-memory adapter expects each model's table to exist up front.
	const db: MemoryDB = { user: [], session: [], account: [], verification: [] };
	return betterAuth({
		baseURL: "http://localhost:3000",
		secret: "test-secret-value-for-email-password-flow-tests",
		database: memoryAdapter(db),
		emailAndPassword: {
			enabled: true,
			autoSignIn: true,
			minPasswordLength: 8,
			requireEmailVerification: options.requireEmailVerification ?? false,
		},
		emailVerification: {
			sendOnSignUp: true,
			autoSignInAfterVerification: true,
			sendVerificationEmail: async ({ user, url }) => {
				options.onVerificationEmail?.({ email: user.email, url });
			},
		},
	});
}

const credentials = {
	name: "Ada Lovelace",
	email: "ada@example.com",
	password: "correct-horse-staple",
};

function sessionCookie(headers: Headers): string {
	const setCookie = headers.get("set-cookie");
	if (!setCookie) throw new Error("expected a set-cookie header");
	// The cookie value is everything before the first attribute separator.
	return setCookie
		.split(",")
		.map((part) => part.split(";")[0])
		.join("; ");
}

describe("email + password cloud auth flow", () => {
	it("signs up, creates a readable session, and signs out", async () => {
		const auth = createTestAuth({ requireEmailVerification: false });

		const { headers, response } = await auth.api.signUpEmail({
			body: credentials,
			returnHeaders: true,
		});

		expect(response.user.email).toBe(credentials.email);
		expect(response.token).toBeTruthy();

		const cookie = sessionCookie(headers);

		const session = await auth.api.getSession({
			headers: new Headers({ cookie }),
		});
		expect(session?.user.email).toBe(credentials.email);

		const { headers: signOutHeaders } = await auth.api.signOut({
			headers: new Headers({ cookie }),
			returnHeaders: true,
		});

		// After sign-out the cleared cookie no longer resolves to a session.
		const clearedCookie = sessionCookie(signOutHeaders);
		const afterSignOut = await auth.api.getSession({
			headers: new Headers({ cookie: clearedCookie }),
		});
		expect(afterSignOut).toBeNull();
	});

	it("signs in an existing user with the right password and rejects the wrong one", async () => {
		const auth = createTestAuth({ requireEmailVerification: false });
		await auth.api.signUpEmail({ body: credentials });

		const { headers, response } = await auth.api.signInEmail({
			body: { email: credentials.email, password: credentials.password },
			returnHeaders: true,
		});
		expect(response.user.email).toBe(credentials.email);

		const session = await auth.api.getSession({
			headers: new Headers({ cookie: sessionCookie(headers) }),
		});
		expect(session?.user.email).toBe(credentials.email);

		await expect(
			auth.api.signInEmail({
				body: { email: credentials.email, password: "wrong-password" },
			}),
		).rejects.toThrow();
	});

	it("enforces email verification before sign-in when required", async () => {
		const sent: Array<{ email: string; url: string }> = [];
		const auth = createTestAuth({
			requireEmailVerification: true,
			onVerificationEmail: (data) => sent.push(data),
		});

		const signUp = await auth.api.signUpEmail({ body: credentials });
		// No session is issued until the address is verified.
		expect(signUp.token).toBeNull();

		// A verification email was dispatched on sign-up.
		expect(sent).toHaveLength(1);
		expect(sent[0]?.email).toBe(credentials.email);
		expect(sent[0]?.url).toContain("verify-email");

		// Signing in before verification is rejected.
		await expect(
			auth.api.signInEmail({
				body: { email: credentials.email, password: credentials.password },
			}),
		).rejects.toThrow();
	});
});
