import { neonConfig } from "@neondatabase/serverless";

const LOCAL_DATABASE_HOST = "db.localtest.me";
const LOCAL_PROXY_REQUEST_HOST = "localhost";

export function isLocalProxy(databaseUrl: string): boolean {
	try {
		return new URL(databaseUrl).hostname === LOCAL_DATABASE_HOST;
	} catch {
		return false;
	}
}

export function configureLocalProxy(): void {
	neonConfig.fetchEndpoint = (_host, port) =>
		`http://${LOCAL_PROXY_REQUEST_HOST}:${port}/sql`;
	neonConfig.wsProxy = (_host, port) =>
		`${LOCAL_PROXY_REQUEST_HOST}:${port}/v2`;
	neonConfig.useSecureWebSocket = false;
}
