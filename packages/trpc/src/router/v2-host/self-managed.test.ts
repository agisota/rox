import { describe, expect, it } from "bun:test";
import {
	buildSelfManagedHostValues,
	DEFAULT_SELF_MANAGED_SANDBOX_TTL_MS,
} from "./self-managed";

describe("buildSelfManagedHostValues", () => {
	it("normalizes a persistent remote host without expiry", () => {
		const values = buildSelfManagedHostValues({
			name: " Build Box ",
			host: " HTTPS://Remote.Example.Com:8443/path ",
			port: 9443,
			protocol: "HTTPS",
			kind: "remote",
			now: new Date("2026-06-16T10:00:00.000Z"),
		});

		expect(values).toEqual({
			machineId: "remote.example.com",
			name: "Build Box",
			kind: "remote",
			provider: "self",
			port: 9443,
			protocol: "https",
			expiresAt: null,
		});
	});

	it("normalizes a host with an inline port when no scheme is provided", () => {
		const values = buildSelfManagedHostValues({
			name: "Build Box",
			host: "remote.example.com:8443",
			port: 9443,
			protocol: "https",
			kind: "remote",
		});

		expect(values.machineId).toBe("remote.example.com");
	});

	it("applies a default TTL for self-managed sandboxes", () => {
		const values = buildSelfManagedHostValues({
			name: "Scratch",
			host: "sandbox.example.com",
			port: 443,
			protocol: "https",
			kind: "sandbox",
			now: new Date("2026-06-16T10:00:00.000Z"),
		});

		expect(values.expiresAt).toEqual(
			new Date(
				Date.UTC(2026, 5, 16, 10, 0, 0) + DEFAULT_SELF_MANAGED_SANDBOX_TTL_MS,
			),
		);
	});

	it("rejects unsupported protocols", () => {
		expect(() =>
			buildSelfManagedHostValues({
				name: "Bad",
				host: "remote.example.com",
				port: 22,
				protocol: "ssh",
				kind: "remote",
			}),
		).toThrow("Unsupported host protocol");
	});
});
