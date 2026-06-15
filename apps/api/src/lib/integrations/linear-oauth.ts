const LINEAR_CALLBACK_PATH = "/api/integrations/linear/callback";

export function buildLinearRedirectUri(apiBaseUrl: string): string {
	return `${apiBaseUrl.replace(/\/+$/, "")}${LINEAR_CALLBACK_PATH}`;
}
