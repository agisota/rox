import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";

// Control what `jwtVerify` does per test. `createRemoteJWKSet` is replaced with
// a no-op factory so no network fetch is attempted.
let verifyImpl: (...args: unknown[]) => Promise<{ payload: unknown }> = () =>
	Promise.resolve({ payload: {} });

mock.module("jose", () => ({
	createRemoteJWKSet: () => () => Promise.resolve({}),
	jwtVerify: (...args: unknown[]) => verifyImpl(...args),
}));

const { verifyRoxJwt } = await import("./jwt-verify");

const AUTH_URL = "https://auth.rox.test";

class JwtExpiredError extends Error {
	code = "ERR_JWT_EXPIRED";
	constructor() {
		super('"exp" claim timestamp check failed');
		this.name = "JWTExpired";
	}
}

describe("verifyRoxJwt", () => {
	let warnSpy: ReturnType<typeof spyOn>;

	beforeEach(() => {
		warnSpy = spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		warnSpy.mockRestore();
		verifyImpl = () => Promise.resolve({ payload: {} });
	});

	test("returns claims for a valid token", async () => {
		verifyImpl = () =>
			Promise.resolve({
				payload: {
					sub: "user-1",
					email: "person@example.com",
					organizationIds: ["org-1", "org-2"],
				},
			});

		const claims = await verifyRoxJwt("token", AUTH_URL);

		expect(claims).toEqual({
			sub: "user-1",
			email: "person@example.com",
			organizationIds: ["org-1", "org-2"],
		});
	});

	test("defaults email to empty string when the claim is absent", async () => {
		verifyImpl = () =>
			Promise.resolve({
				payload: { sub: "user-1", organizationIds: ["org-1"] },
			});

		const claims = await verifyRoxJwt("token", AUTH_URL);

		expect(claims).toEqual({
			sub: "user-1",
			email: "",
			organizationIds: ["org-1"],
		});
	});

	test("returns null when sub is missing", async () => {
		verifyImpl = () =>
			Promise.resolve({ payload: { organizationIds: ["org-1"] } });

		expect(await verifyRoxJwt("token", AUTH_URL)).toBeNull();
	});

	test("returns null when organizationIds is missing", async () => {
		verifyImpl = () => Promise.resolve({ payload: { sub: "user-1" } });

		expect(await verifyRoxJwt("token", AUTH_URL)).toBeNull();
	});

	test("returns null (no throw) on an expired token", async () => {
		verifyImpl = () => Promise.reject(new JwtExpiredError());

		const claims = await verifyRoxJwt("token", AUTH_URL);

		expect(claims).toBeNull();
	});

	test("does NOT log on an expired token (silent hourly rotation)", async () => {
		verifyImpl = () => Promise.reject(new JwtExpiredError());

		await verifyRoxJwt("token", AUTH_URL);

		expect(warnSpy).not.toHaveBeenCalled();
	});

	test("logs a terse message on other failures, never the payload/PII", async () => {
		verifyImpl = () =>
			Promise.reject(new Error("signature verification failed"));

		const claims = await verifyRoxJwt("token", AUTH_URL, "relay");

		expect(claims).toBeNull();
		expect(warnSpy).toHaveBeenCalledTimes(1);
		const logged = String(warnSpy.mock.calls[0]?.[0] ?? "");
		expect(logged).toBe(
			"[relay] JWT verification failed: signature verification failed",
		);
		// No decoded payload / email leaked into the log line.
		expect(logged).not.toContain("@");
		expect(logged).not.toContain("organizationIds");
	});

	test("uses the provided log prefix", async () => {
		verifyImpl = () => Promise.reject(new Error("bad token"));

		await verifyRoxJwt("token", AUTH_URL, "electric-proxy");

		expect(String(warnSpy.mock.calls[0]?.[0] ?? "")).toContain(
			"[electric-proxy]",
		);
	});
});
