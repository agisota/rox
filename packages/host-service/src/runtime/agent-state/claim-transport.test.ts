import { describe, expect, it } from "bun:test";
import {
	createApiClaimTransport,
	type RuntimeClaimProc,
} from "./claim-transport";

const REQUEST = {
	orgId: "org-1",
	deviceId: "device-a",
	scope: "workspace" as const,
	scopeId: "ws-1",
	key: "lock",
};

describe("createApiClaimTransport", () => {
	it("reports not-wired when no claim procedure is provided", async () => {
		const transport = createApiClaimTransport({ claimProc: undefined });
		const result = await transport.claim(REQUEST);
		expect(result).toEqual({ ok: false, reason: "claims-not-wired" });
	});

	it("grants when the cloud procedure returns ok", async () => {
		const claimProc: RuntimeClaimProc = async (input) => ({
			ok: true,
			ownerDevice: input.deviceId,
		});
		const transport = createApiClaimTransport({ claimProc });
		const result = await transport.claim(REQUEST);
		expect(result.ok).toBe(true);
		expect(result.ownerDevice).toBe("device-a");
	});

	it("refuses when the cloud procedure reports contention", async () => {
		const claimProc: RuntimeClaimProc = async () => ({
			ok: false,
			ownerDevice: "device-b",
			reason: "held-by-other",
		});
		const transport = createApiClaimTransport({ claimProc });
		const result = await transport.claim(REQUEST);
		expect(result.ok).toBe(false);
		expect(result.ownerDevice).toBe("device-b");
		expect(result.reason).toBe("held-by-other");
	});

	it("degrades to not-wired when the cloud procedure throws", async () => {
		const claimProc: RuntimeClaimProc = async () => {
			throw new Error("runtime.claim not found");
		};
		const transport = createApiClaimTransport({ claimProc });
		const result = await transport.claim(REQUEST);
		expect(result.ok).toBe(false);
		expect(result.reason).toBe("claims-not-wired");
	});
});
