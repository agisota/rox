import { describe, expect, it } from "bun:test";
import { DaytonaProvisioner } from "./daytona";
import { DEFAULT_SANDBOX_TTL_MS, ProvisionerError } from "./http";
import type { FetchLike } from "./types";

interface RecordedCall {
	url: string;
	method: string;
	body: unknown;
	headers: Record<string, string>;
}

function mockFetch(
	handler: (call: RecordedCall) => { status?: number; json?: unknown },
): { fetch: FetchLike; calls: RecordedCall[] } {
	const calls: RecordedCall[] = [];
	const fetchImpl: FetchLike = async (url, init) => {
		const call: RecordedCall = {
			url,
			method: init?.method ?? "GET",
			body: init?.body ? JSON.parse(init.body as string) : undefined,
			headers: (init?.headers as Record<string, string>) ?? {},
		};
		calls.push(call);
		const { status = 200, json = {} } = handler(call);
		return new Response(status === 204 ? null : JSON.stringify(json), {
			status,
			headers: { "content-type": "application/json" },
		});
	};
	return { fetch: fetchImpl, calls };
}

describe("DaytonaProvisioner", () => {
	it("provisions a persistent remote host with no expiry", async () => {
		const { fetch, calls } = mockFetch(() => ({
			json: { id: "ws-1", runnerDomain: "ws-1.daytona.io", port: 22222 },
		}));
		const provisioner = new DaytonaProvisioner({ apiKey: "key", fetch });

		const host = await provisioner.provision({ kind: "remote" });

		expect(host).toEqual({
			id: "ws-1",
			provider: "daytona",
			kind: "remote",
			host: "ws-1.daytona.io",
			port: 22222,
			protocol: "https",
			expiresAt: null,
		});
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.headers.authorization).toBe("Bearer key");
		expect(calls[0]?.body).toMatchObject({ autoStopInterval: 0 });
	});

	it("provisions an ephemeral sandbox with a TTL-derived expiry", async () => {
		const { fetch, calls } = mockFetch(() => ({
			json: { id: "sbx-9", runnerDomain: "sbx-9.daytona.io", port: 443 },
		}));
		const provisioner = new DaytonaProvisioner({ apiKey: "key", fetch });

		const before = Date.now();
		const host = await provisioner.provision({ kind: "sandbox" });
		const after = Date.now();

		expect(host.kind).toBe("sandbox");
		expect(host.expiresAt).not.toBeNull();
		const expiry = new Date(host.expiresAt as string).getTime();
		expect(expiry).toBeGreaterThanOrEqual(before + DEFAULT_SANDBOX_TTL_MS);
		expect(expiry).toBeLessThanOrEqual(after + DEFAULT_SANDBOX_TTL_MS);
		expect(calls[0]?.body).toMatchObject({ autoStopInterval: 60 });
	});

	it("throws ProvisionerError on a non-2xx response", async () => {
		const { fetch } = mockFetch(() => ({
			status: 402,
			json: { error: "pay" },
		}));
		const provisioner = new DaytonaProvisioner({ apiKey: "key", fetch });

		await expect(
			provisioner.provision({ kind: "remote" }),
		).rejects.toBeInstanceOf(ProvisionerError);
	});

	it("destroys by id", async () => {
		const { fetch, calls } = mockFetch(() => ({ status: 204 }));
		const provisioner = new DaytonaProvisioner({ apiKey: "key", fetch });

		await provisioner.destroy("ws-1");

		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toContain("/workspace/ws-1");
	});

	it("maps provider status into a normalized state", async () => {
		const { fetch } = mockFetch(() => ({
			json: { id: "ws-1", state: "started", expiresAt: null },
		}));
		const provisioner = new DaytonaProvisioner({ apiKey: "key", fetch });

		const status = await provisioner.status("ws-1");
		expect(status).toEqual({ id: "ws-1", state: "running", expiresAt: null });
	});
});
