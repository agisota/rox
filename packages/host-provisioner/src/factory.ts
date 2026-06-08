import { DaytonaProvisioner } from "./daytona";
import { E2BProvisioner } from "./e2b";
import { ModalProvisioner } from "./modal";
import type { FetchLike, HostProvisioner, ProvisionProvider } from "./types";

export interface ProvisionerFactoryOptions {
	/** Override the API key (otherwise read from env). */
	apiKey?: string;
	baseUrl?: string;
	/** Injectable fetch for tests. */
	fetch?: FetchLike;
}

/** Env var holding the API key for each provider. */
const PROVIDER_ENV_KEY: Record<ProvisionProvider, string> = {
	daytona: "DAYTONA_API_KEY",
	modal: "MODAL_API_KEY",
	e2b: "E2B_API_KEY",
};

export class MissingProvisionerCredentialsError extends Error {
	constructor(provider: ProvisionProvider, envKey: string) {
		super(`Missing credentials for ${provider}: set ${envKey}`);
		this.name = "MissingProvisionerCredentialsError";
	}
}

function resolveApiKey(provider: ProvisionProvider, override?: string): string {
	const envKey = PROVIDER_ENV_KEY[provider];
	const apiKey = override ?? process.env[envKey];
	if (!apiKey) {
		throw new MissingProvisionerCredentialsError(provider, envKey);
	}
	return apiKey;
}

/**
 * Build the {@link HostProvisioner} for a managed backend. API keys are read
 * from env server-side unless explicitly provided (tests inject both the key
 * and a mocked `fetch`).
 */
export function getHostProvisioner(
	provider: ProvisionProvider,
	options: ProvisionerFactoryOptions = {},
): HostProvisioner {
	const config = {
		apiKey: resolveApiKey(provider, options.apiKey),
		baseUrl: options.baseUrl,
		fetch: options.fetch,
	};

	switch (provider) {
		case "daytona":
			return new DaytonaProvisioner(config);
		case "modal":
			return new ModalProvisioner(config);
		case "e2b":
			return new E2BProvisioner(config);
		default: {
			const exhaustive: never = provider;
			throw new Error(`Unknown provisioner provider: ${String(exhaustive)}`);
		}
	}
}

/** Providers that have credentials configured in the current environment. */
export function listAvailableProviders(): ProvisionProvider[] {
	return (Object.keys(PROVIDER_ENV_KEY) as ProvisionProvider[]).filter(
		(provider) => Boolean(process.env[PROVIDER_ENV_KEY[provider]]),
	);
}
