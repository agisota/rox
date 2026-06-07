import { CLIError } from "@rox/cli-framework";
import { type ApiClient, createApiClient } from "./api-client";
import { refreshAccessToken } from "./auth";
import { type RoxConfig, readConfig, writeConfig } from "./config";

export type AuthSource = "override" | "config" | "oauth";

export type ResolvedAuth = {
	config: RoxConfig;
	api: ApiClient;
	bearer: string;
	authSource: AuthSource;
};

const REFRESH_LEEWAY_MS = 5 * 60 * 1000;

export async function resolveAuth(
	apiKeyOption: string | undefined,
): Promise<ResolvedAuth> {
	let config = readConfig();

	const overrideKey = apiKeyOption?.trim();
	let bearer: string | undefined;
	let authSource: AuthSource;

	if (overrideKey) {
		bearer = overrideKey;
		authSource = "override";
	} else if (config.apiKey?.trim()) {
		bearer = config.apiKey.trim();
		authSource = "config";
	} else if (config.auth) {
		const auth = config.auth;
		if (auth.expiresAt - REFRESH_LEEWAY_MS < Date.now()) {
			if (!auth.refreshToken) {
				throw new CLIError("Session expired", "Run: rox auth login");
			}
			try {
				const refreshed = await refreshAccessToken(auth.refreshToken);
				config = {
					...config,
					auth: {
						accessToken: refreshed.accessToken,
						refreshToken: refreshed.refreshToken,
						expiresAt: refreshed.expiresAt,
					},
				};
				writeConfig(config);
				bearer = refreshed.accessToken;
			} catch {
				throw new CLIError("Session expired", "Run: rox auth login");
			}
		} else {
			bearer = auth.accessToken;
		}
		authSource = "oauth";
	} else {
		throw new CLIError(
			"Not logged in",
			"Run: rox auth login (or set ROX_API_KEY)",
		);
	}

	const api = createApiClient({
		bearer,
		organizationId: config.organizationId,
	});
	return { config, api, bearer, authSource };
}
