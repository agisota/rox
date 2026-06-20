export const LOCAL_PLAYWRIGHT_SMOKE_SCOPE = "local-playwright-smoke";
export const LOCAL_PLAYWRIGHT_SMOKE_AUTH_TOKEN = "local.playwright.smoke";

type E2EAuthBypassSource = {
	nodeEnv: string | undefined;
	flag: string | boolean | undefined;
	scope?: string | undefined;
};

export function shouldBypassAuthForE2E({
	nodeEnv,
	flag,
	scope,
}: E2EAuthBypassSource): boolean {
	const isEnabledFlag = flag === true || flag === "1" || flag === "true";
	if (!isEnabledFlag) return false;
	if (nodeEnv !== "production") return true;
	return scope === LOCAL_PLAYWRIGHT_SMOKE_SCOPE;
}

export function resolveE2EAuthBypass({
	buildTime,
	runtime,
}: {
	buildTime: E2EAuthBypassSource;
	runtime?: E2EAuthBypassSource | undefined;
}): boolean {
	return (
		shouldBypassAuthForE2E(buildTime) ||
		(runtime ? shouldBypassAuthForE2E(runtime) : false)
	);
}
