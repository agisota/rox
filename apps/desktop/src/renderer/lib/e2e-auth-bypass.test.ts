import { describe, expect, test } from "bun:test";
import {
	LOCAL_PLAYWRIGHT_SMOKE_AUTH_TOKEN,
	resolveE2EAuthBypass,
	shouldBypassAuthForE2E,
} from "./e2e-auth-bypass";

describe("shouldBypassAuthForE2E", () => {
	test("allows the explicit e2e flag outside production", () => {
		expect(shouldBypassAuthForE2E({ nodeEnv: "development", flag: "1" })).toBe(
			true,
		);
		expect(shouldBypassAuthForE2E({ nodeEnv: "test", flag: "true" })).toBe(
			true,
		);
	});

	test("ignores the e2e flag in production", () => {
		expect(shouldBypassAuthForE2E({ nodeEnv: "production", flag: "1" })).toBe(
			false,
		);
		expect(shouldBypassAuthForE2E({ nodeEnv: "production", flag: true })).toBe(
			false,
		);
	});

	test("requires the local smoke scope when the renderer is production-baked", () => {
		expect(
			shouldBypassAuthForE2E({
				nodeEnv: "production",
				flag: "1",
				scope: "local-playwright-smoke",
			}),
		).toBe(true);
	});

	test("requires an explicit enabled flag", () => {
		expect(
			shouldBypassAuthForE2E({ nodeEnv: "development", flag: undefined }),
		).toBe(false);
		expect(shouldBypassAuthForE2E({ nodeEnv: "development", flag: "0" })).toBe(
			false,
		);
	});

	test("uses a JWT-shaped local smoke token so host-service does not mint one through cloud auth", () => {
		const tokenParts = LOCAL_PLAYWRIGHT_SMOKE_AUTH_TOKEN.split(".");

		expect(tokenParts).toHaveLength(3);
		expect(tokenParts.every(Boolean)).toBe(true);
	});

	test("allows a production-baked renderer to use a runtime local smoke flag from preload", () => {
		expect(
			resolveE2EAuthBypass({
				buildTime: {
					nodeEnv: "production",
					flag: undefined,
					scope: undefined,
				},
				runtime: {
					nodeEnv: "production",
					flag: "1",
					scope: "local-playwright-smoke",
				},
			}),
		).toBe(true);
	});

	test("does not allow a production-baked renderer with an unscoped runtime flag", () => {
		expect(
			resolveE2EAuthBypass({
				buildTime: {
					nodeEnv: "production",
					flag: undefined,
					scope: undefined,
				},
				runtime: {
					nodeEnv: "production",
					flag: "1",
					scope: undefined,
				},
			}),
		).toBe(false);
	});
});
