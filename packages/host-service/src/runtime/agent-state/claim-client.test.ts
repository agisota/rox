import { describe, expect, it } from "bun:test";
import { createServiceTokenClaimTransport } from "./claim-client";

/**
 * `createServiceTokenClaimTransport` is the opt-in gate that decides whether the
 * agent-state runtime gets a real (Postgres-arbitrated) claim path. The actual
 * `runtime.claim` round-trip is covered server-side in `@rox/trpc`; here we pin
 * the gating contract that protects single-writer correctness:
 *   • no service token  → undefined  → runtime stays unwired (graceful not-wired)
 *   • service token set  → a usable ClaimTransport bound to the cloud mutation
 */
describe("createServiceTokenClaimTransport", () => {
	it("returns undefined when no service token is configured", () => {
		const transport = createServiceTokenClaimTransport({
			cloudApiUrl: "https://api.test",
			serviceToken: "",
		});
		expect(transport).toBeUndefined();
	});

	it("returns a ClaimTransport when a service token is configured", () => {
		const transport = createServiceTokenClaimTransport({
			cloudApiUrl: "https://api.test",
			serviceToken: "svc-token",
		});
		expect(transport).toBeDefined();
		expect(typeof transport?.claim).toBe("function");
	});
});
