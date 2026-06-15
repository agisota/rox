import { describe, expect, it } from "bun:test";
import type { SelectV2Host } from "@rox/db/schema";
import {
	buildLocalHostFallback,
	mergeHostsWithLocalFallback,
} from "./localHostFallback";

const now = new Date("2026-06-15T10:00:00.000Z");

function host(overrides: Partial<SelectV2Host> = {}): SelectV2Host {
	return {
		organizationId: "org-1",
		machineId: "machine-1",
		name: "Persisted host",
		isOnline: false,
		port: null,
		protocol: null,
		kind: "local",
		provider: null,
		expiresAt: null,
		createdByUserId: "user-1",
		createdAt: now,
		updatedAt: now,
		...overrides,
	};
}

describe("buildLocalHostFallback", () => {
	it("builds an online local host from the host-service connection", () => {
		expect(
			buildLocalHostFallback({
				activeHostUrl: "http://127.0.0.1:47821",
				activeOrganizationId: "org-1",
				activeOrganizationName: "agisota's Team",
				currentUserId: "user-1",
				hostServiceStatus: "running",
				machineId: "machine-1",
				now,
			}),
		).toEqual(
			host({
				name: "agisota's Team · Это устройство",
				isOnline: true,
				port: 47821,
				protocol: "http",
			}),
		);
	});

	it("does not create a fallback before organization and machine identity exist", () => {
		expect(
			buildLocalHostFallback({
				activeHostUrl: "http://127.0.0.1:47821",
				activeOrganizationId: null,
				activeOrganizationName: null,
				currentUserId: "user-1",
				hostServiceStatus: "running",
				machineId: "machine-1",
				now,
			}),
		).toBeNull();
	});
});

describe("mergeHostsWithLocalFallback", () => {
	it("adds the local fallback when Electric has not synced the host row yet", () => {
		const remote = host({ machineId: "remote-1", name: "Remote" });
		const local = host({ isOnline: true });

		expect(mergeHostsWithLocalFallback([remote], local)).toEqual([
			remote,
			local,
		]);
	});

	it("does not duplicate a synced local host and hydrates live local reachability", () => {
		const persisted = host({ isOnline: false, port: null, protocol: null });
		const local = host({ isOnline: true, port: 47821, protocol: "http" });

		expect(mergeHostsWithLocalFallback([persisted], local)).toEqual([
			host({ isOnline: true, port: 47821, protocol: "http" }),
		]);
	});
});
