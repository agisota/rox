import type { SelectV2Host } from "@rox/db/schema";
import type { HostServiceAvailabilityStatus } from "renderer/lib/host-service-unavailable";

interface BuildLocalHostFallbackInput {
	activeHostUrl: string | null;
	activeOrganizationId: string | null;
	activeOrganizationName: string | null;
	currentUserId: string | null;
	hostServiceStatus: HostServiceAvailabilityStatus;
	machineId: string | null;
	now?: Date;
}

function parseHostUrl(activeHostUrl: string | null): {
	port: number | null;
	protocol: string | null;
} {
	if (!activeHostUrl) return { port: null, protocol: null };

	try {
		const url = new URL(activeHostUrl);
		const port = url.port ? Number(url.port) : null;
		return {
			port: Number.isFinite(port) ? port : null,
			protocol: url.protocol.replace(/:$/, "") || null,
		};
	} catch {
		return { port: null, protocol: null };
	}
}

export function buildLocalHostFallback({
	activeHostUrl,
	activeOrganizationId,
	activeOrganizationName,
	currentUserId,
	hostServiceStatus,
	machineId,
	now = new Date(),
}: BuildLocalHostFallbackInput): SelectV2Host | null {
	if (!activeOrganizationId || !machineId) return null;

	const { port, protocol } = parseHostUrl(activeHostUrl);
	const isOnline = hostServiceStatus === "running" || activeHostUrl !== null;

	return {
		organizationId: activeOrganizationId,
		machineId,
		name: activeOrganizationName
			? `${activeOrganizationName} · Это устройство`
			: "Это устройство",
		isOnline,
		port,
		protocol,
		kind: "local",
		provider: null,
		expiresAt: null,
		createdByUserId: currentUserId,
		createdAt: now,
		updatedAt: now,
	};
}

export function mergeHostsWithLocalFallback(
	hosts: SelectV2Host[],
	localFallback: SelectV2Host | null,
): SelectV2Host[] {
	if (!localFallback) return hosts;

	let foundLocalHost = false;
	const merged = hosts.map((host) => {
		if (host.machineId !== localFallback.machineId) return host;
		foundLocalHost = true;
		return {
			...host,
			isOnline: host.isOnline || localFallback.isOnline,
			port: host.port ?? localFallback.port,
			protocol: host.protocol ?? localFallback.protocol,
		};
	});

	return foundLocalHost ? merged : [...merged, localFallback];
}
