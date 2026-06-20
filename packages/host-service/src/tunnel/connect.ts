import { getHostId, getHostName } from "@rox/shared/host-info";
import { buildHostRoutingKey } from "@rox/shared/host-routing";
import { logger } from "../lib/logger";
import type { JwtApiAuthProvider } from "../providers/auth/JwtAuthProvider/JwtAuthProvider";
import type { ApiClient } from "../types";
import { TunnelClient } from "./tunnel-client";

export interface ConnectRelayOptions {
	api: ApiClient;
	relayUrl: string;
	localPort: number;
	organizationId: string;
	authProvider: JwtApiAuthProvider;
	hostServiceSecret: string;
	/**
	 * Pre-assigned host id for managed sandboxes (C5/D7). When set, it overrides
	 * the locally-derived machine id so the relay routing key matches the host
	 * row the provisioner created. Self-managed hosts leave this undefined and
	 * fall back to `getHostId()`.
	 */
	machineIdOverride?: string;
}

export async function connectRelay(
	options: ConnectRelayOptions,
): Promise<TunnelClient | null> {
	try {
		const machineId = options.machineIdOverride ?? getHostId();
		const host = await options.api.host.ensure.mutate({
			organizationId: options.organizationId,
			machineId,
			name: getHostName(),
		});
		logger.info(`[host-service] registered as host ${host.machineId}`);

		const tunnel = new TunnelClient({
			relayUrl: options.relayUrl,
			hostId: buildHostRoutingKey(options.organizationId, host.machineId),
			getAuthToken: () => options.authProvider.getJwt(),
			localPort: options.localPort,
			hostServiceSecret: options.hostServiceSecret,
		});
		void tunnel.connect();
		return tunnel;
	} catch (error) {
		logger.error("[host-service] failed to register/connect relay:", error);
		return null;
	}
}
