import { describe, expect, test } from "bun:test";
import { HEALTH_POLL_TIMEOUT_MS } from "./host-service-utils";

describe("host-service health polling budget", () => {
	test("allows slow local desktop startup before declaring host-service dead", () => {
		// The desktop child can spend ~8s resolving the interactive shell env before
		// it reaches DB migrations and workspace startup. The health poll budget must
		// leave room for that path instead of SIGTERMing a healthy-but-slow child.
		expect(HEALTH_POLL_TIMEOUT_MS).toBeGreaterThanOrEqual(30_000);
	});
});
