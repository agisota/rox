import { neonConfig } from "@neondatabase/serverless";

const LOCAL_DATABASE_HOST = "db.localtest.me";

export function isLocalProxy(databaseUrl: string): boolean {
	try {
		return new URL(databaseUrl).hostname === LOCAL_DATABASE_HOST;
	} catch {
		return false;
	}
}

export function configureLocalProxy(): void {
	// `db.localtest.me` is supposed to resolve to 127.0.0.1, but some local
	// resolvers (custom DNS / Pi-hole / VPN) hijack it to a public IP, which
	// makes the Neon HTTP driver fetch the wrong host and fail. Pin the local
	// proxy to loopback so it always reaches the docker proxy regardless of DNS.
	neonConfig.fetchEndpoint = (_host, port) => `http://127.0.0.1:${port}/sql`;
	neonConfig.wsProxy = (_host, port) => `127.0.0.1:${port}/v2`;
	neonConfig.useSecureWebSocket = false;
}
