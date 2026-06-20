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
}

export async function connectRelay(
	options: ConnectRelayOptions,
): Promise<TunnelClient | null> {
	try {
		const host = await options.api.host.ensure.mutate({
			organizationId: options.organizationId,
			machineId: getHostId(),
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
