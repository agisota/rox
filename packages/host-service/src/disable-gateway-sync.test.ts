import { describe, expect, test } from "bun:test";
import { disableGatewaySyncForPackagedRuntime } from "./disable-gateway-sync";

describe("disableGatewaySyncForPackagedRuntime", () => {
	test("pins MASTRA_DEV=false in the packaged (production) runtime", () => {
		const env: NodeJS.ProcessEnv = { NODE_ENV: "production" };
		const pinned = disableGatewaySyncForPackagedRuntime(env);
		expect(pinned).toBe(true);
		expect(env.MASTRA_DEV).toBe("false");
	});

	test("overrides a truthy MASTRA_DEV inherited from the parent env", () => {
		const env: NodeJS.ProcessEnv = {
			NODE_ENV: "production",
			MASTRA_DEV: "true",
		};
		disableGatewaySyncForPackagedRuntime(env);
		expect(env.MASTRA_DEV).toBe("false");
	});

	test("pins the flag off when NODE_ENV is unset (bundled runtime default)", () => {
		const env: NodeJS.ProcessEnv = {};
		const pinned = disableGatewaySyncForPackagedRuntime(env);
		expect(pinned).toBe(true);
		expect(env.MASTRA_DEV).toBe("false");
	});

	test("leaves MASTRA_DEV untouched in an unbundled dev run", () => {
		const env: NodeJS.ProcessEnv = {
			NODE_ENV: "development",
			MASTRA_DEV: "true",
		};
		const pinned = disableGatewaySyncForPackagedRuntime(env);
		expect(pinned).toBe(false);
		expect(env.MASTRA_DEV).toBe("true");
	});

	test("does not enable gateway sync in a dev run that had it off", () => {
		const env: NodeJS.ProcessEnv = { NODE_ENV: "development" };
		disableGatewaySyncForPackagedRuntime(env);
		expect(env.MASTRA_DEV).toBeUndefined();
	});
});
