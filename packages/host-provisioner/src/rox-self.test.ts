import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	getHostProvisioner,
	listAvailableProviders,
	MissingProvisionerCredentialsError,
} from "./factory";
import { ProvisionerError } from "./http";
import { RoxSelfProvisioner } from "./rox-self";
import type { FetchLike } from "./types";

interface RecordedCall {
	url: string;
	method: string;
	body: unknown;
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

const BASE_URL = "http://dockerbox:2375";

describe("RoxSelfProvisioner", () => {
	it("provisions: create + start + inspect, mapping the published address", async () => {
		const { fetch, calls } = mockFetch((call) => {
			if (call.url.endsWith("/containers/create")) {
				return { status: 201, json: { Id: "c0ffee", Warnings: [] } };
			}
			if (call.url.endsWith("/start")) {
				return { status: 204 };
			}
			// inspect
			return {
				json: {
					Id: "c0ffee",
					State: { Status: "running" },
					NetworkSettings: {
						Ports: {
							"4879/tcp": [{ HostIp: "0.0.0.0", HostPort: "49200" }],
						},
					},
				},
			};
		});
		const provisioner = new RoxSelfProvisioner({
			apiKey: "",
			baseUrl: BASE_URL,
			fetch,
		});

		const host = await provisioner.provision({ kind: "remote", label: "box" });

		// create
		expect(calls[0]?.method).toBe("POST");
		expect(calls[0]?.url).toBe(`${BASE_URL}/containers/create`);
		expect(calls[0]?.body).toMatchObject({
			Image: "ghcr.io/agisota/rox-host-service:latest",
			Labels: { "rox.kind": "remote", "rox.label": "box" },
			HostConfig: { PublishAllPorts: true },
		});
		// start
		expect(calls[1]?.method).toBe("POST");
		expect(calls[1]?.url).toBe(`${BASE_URL}/containers/c0ffee/start`);
		// inspect
		expect(calls[2]?.method).toBe("GET");
		expect(calls[2]?.url).toBe(`${BASE_URL}/containers/c0ffee/json`);

		// HostIp 0.0.0.0 → use the docker host; HostPort is honored.
		expect(host).toEqual({
			id: "c0ffee",
			provider: "self",
			kind: "remote",
			host: "dockerbox",
			port: 49200,
			protocol: "https",
			expiresAt: null,
		});
	});

	it("uses a concrete HostIp binding when Docker provides one", async () => {
		const { fetch } = mockFetch((call) => {
			if (call.url.endsWith("/containers/create")) {
				return { status: 201, json: { Id: "abc" } };
			}
			if (call.url.endsWith("/start")) return { status: 204 };
			return {
				json: {
					Id: "abc",
					State: { Status: "running" },
					NetworkSettings: {
						Ports: { "4879/tcp": [{ HostIp: "10.0.0.5", HostPort: "8080" }] },
					},
				},
			};
		});
		const provisioner = new RoxSelfProvisioner({
			apiKey: "",
			baseUrl: BASE_URL,
			fetch,
		});

		const host = await provisioner.provision({ kind: "remote" });
		expect(host.host).toBe("10.0.0.5");
		expect(host.port).toBe(8080);
	});

	it("derives a TTL expiry for ephemeral sandboxes", async () => {
		const { fetch } = mockFetch((call) => {
			if (call.url.endsWith("/containers/create")) {
				return { status: 201, json: { Id: "sbx" } };
			}
			if (call.url.endsWith("/start")) return { status: 204 };
			return {
				json: {
					Id: "sbx",
					State: { Status: "running" },
					NetworkSettings: {
						Ports: { "4879/tcp": [{ HostIp: "0.0.0.0", HostPort: "5000" }] },
					},
				},
			};
		});
		const provisioner = new RoxSelfProvisioner({
			apiKey: "",
			baseUrl: BASE_URL,
			fetch,
		});

		const before = Date.now();
		const host = await provisioner.provision({ kind: "sandbox", ttlMs: 1000 });
		const after = Date.now();

		expect(host.kind).toBe("sandbox");
		expect(host.expiresAt).not.toBeNull();
		const expiry = new Date(host.expiresAt as string).getTime();
		expect(expiry).toBeGreaterThanOrEqual(before + 1000);
		expect(expiry).toBeLessThanOrEqual(after + 1000);
	});

	it("throws ProvisionerError on a non-2xx create response", async () => {
		const { fetch } = mockFetch(() => ({
			status: 500,
			json: { message: "no" },
		}));
		const provisioner = new RoxSelfProvisioner({
			apiKey: "",
			baseUrl: BASE_URL,
			fetch,
		});

		await expect(
			provisioner.provision({ kind: "remote" }),
		).rejects.toBeInstanceOf(ProvisionerError);
	});

	it("destroys by id with force + volume removal", async () => {
		const { fetch, calls } = mockFetch(() => ({ status: 204 }));
		const provisioner = new RoxSelfProvisioner({
			apiKey: "",
			baseUrl: BASE_URL,
			fetch,
		});

		await provisioner.destroy("c0ffee");

		expect(calls[0]?.method).toBe("DELETE");
		expect(calls[0]?.url).toBe(
			`${BASE_URL}/containers/c0ffee?force=true&v=true`,
		);
	});

	it("maps container status into a normalized state", async () => {
		const cases: Array<[string, string]> = [
			["running", "running"],
			["created", "provisioning"],
			["restarting", "provisioning"],
			["exited", "stopped"],
			["dead", "stopped"],
			["paused", "stopped"],
			["weird", "unknown"],
		];

		for (const [dockerStatus, expected] of cases) {
			const { fetch } = mockFetch(() => ({
				json: { Id: "c0ffee", State: { Status: dockerStatus } },
			}));
			const provisioner = new RoxSelfProvisioner({
				apiKey: "",
				baseUrl: BASE_URL,
				fetch,
			});
			const status = await provisioner.status("c0ffee");
			expect(status).toEqual({
				id: "c0ffee",
				state: expected as never,
				expiresAt: null,
			});
		}
	});
});

describe("rox-self factory env-gating", () => {
	const ENV_KEYS = [
		"DAYTONA_API_KEY",
		"MODAL_API_KEY",
		"E2B_API_KEY",
		"ROX_SELF_DOCKER_HOST",
	] as const;
	const saved: Record<string, string | undefined> = {};

	beforeEach(() => {
		for (const key of ENV_KEYS) {
			saved[key] = process.env[key];
			delete process.env[key];
		}
	});

	afterEach(() => {
		for (const key of ENV_KEYS) {
			if (saved[key] === undefined) delete process.env[key];
			else process.env[key] = saved[key];
		}
	});

	it("appears in listAvailableProviders only when ROX_SELF_DOCKER_HOST is set", () => {
		expect(listAvailableProviders()).not.toContain("self");
		process.env.ROX_SELF_DOCKER_HOST = "http://dockerbox:2375";
		expect(listAvailableProviders()).toEqual(["self"]);
	});

	it("builds RoxSelfProvisioner from the gating env var", () => {
		process.env.ROX_SELF_DOCKER_HOST = "http://dockerbox:2375";
		expect(getHostProvisioner("self")).toBeInstanceOf(RoxSelfProvisioner);
	});

	it("throws when ROX_SELF_DOCKER_HOST is missing", () => {
		expect(() => getHostProvisioner("self")).toThrow(
			MissingProvisionerCredentialsError,
		);
	});
});
