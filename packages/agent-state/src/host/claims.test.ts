import { describe, expect, it } from "bun:test";
import type { ClaimResult } from "../core/service";
import {
	type ClaimTransport,
	claimResolverFromTransport,
	notWiredClaimTransport,
	requestClaim,
} from "./claims";

describe("requestClaim", () => {
	it("returns not-wired when no transport is configured", async () => {
		const result = await requestClaim({
			orgId: "org_1",
			deviceId: "dev_a",
			scope: "workspace",
			scopeId: "ws_1",
			key: "lock",
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toBe("claims-not-wired");
	});

	it("grants a claim through a wired Postgres-arbitrated transport", async () => {
		const granting: ClaimTransport = {
			async claim(input): Promise<ClaimResult> {
				return { ok: true, ownerDevice: input.deviceId };
			},
		};
		const result = await requestClaim({
			orgId: "org_1",
			deviceId: "dev_a",
			scope: "workspace",
			scopeId: "ws_1",
			key: "lock",
			transport: granting,
		});
		expect(result.ok).toBe(true);
		expect(result.ownerDevice).toBe("dev_a");
	});

	it("reports contention when another device holds the claim", async () => {
		const contended: ClaimTransport = {
			async claim(): Promise<ClaimResult> {
				return { ok: false, ownerDevice: "dev_b", reason: "held" };
			},
		};
		const result = await requestClaim({
			orgId: "org_1",
			deviceId: "dev_a",
			scope: "run",
			scopeId: "run_1",
			key: "owner",
			transport: contended,
		});
		expect(result.ok).toBe(false);
		expect(result.ownerDevice).toBe("dev_b");
		expect(result.reason).toBe("held");
	});

	it("notWiredClaimTransport always refuses", async () => {
		const result = await notWiredClaimTransport.claim({
			orgId: "org_1",
			deviceId: "dev_a",
			scope: "host",
			scopeId: "host_1",
			key: "k",
		});
		expect(result.ok).toBe(false);
		expect(result.reason).toBe("claims-not-wired");
	});

	it("claimResolverFromTransport adapts a transport into a resolver", async () => {
		const resolver = claimResolverFromTransport({
			async claim(input) {
				return { ok: true, ownerDevice: input.deviceId };
			},
		});
		const result = await resolver.claim({
			orgId: "org_1",
			deviceId: "dev_a",
			scope: "workspace",
			scopeId: "ws_1",
			key: "lock",
		});
		expect(result.ok).toBe(true);

		const fallback = claimResolverFromTransport();
		const refused = await fallback.claim({
			orgId: "org_1",
			deviceId: "dev_a",
			scope: "workspace",
			scopeId: "ws_1",
			key: "lock",
		});
		expect(refused.reason).toBe("claims-not-wired");
	});
});
