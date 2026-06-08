import { DEFAULT_SANDBOX_TTL_MS, jsonRequest, resolveFetch } from "./http";
import type {
	FetchLike,
	HostProvisioner,
	HostStatus,
	HostStatusState,
	ProvisionedHost,
	ProvisionerConfig,
	ProvisionInput,
} from "./types";

const DEFAULT_BASE_URL = "https://app.daytona.io/api";

interface DaytonaWorkspaceResponse {
	id: string;
	state?: string;
	runnerDomain?: string;
	port?: number;
	expiresAt?: string | null;
}

function mapState(state: string | undefined): HostStatusState {
	switch (state) {
		case "started":
		case "running":
			return "running";
		case "creating":
		case "starting":
			return "provisioning";
		case "stopped":
		case "destroyed":
			return "stopped";
		default:
			return "unknown";
	}
}

/**
 * Daytona adapter. Persistent `remote` workspaces have no TTL; ephemeral
 * `sandbox` workspaces get an auto-stop interval (~1h by default).
 */
export class DaytonaProvisioner implements HostProvisioner {
	readonly provider = "daytona" as const;
	private readonly apiKey: string;
	private readonly baseUrl: string;
	private readonly fetchImpl: FetchLike;

	constructor(config: ProvisionerConfig) {
		this.apiKey = config.apiKey;
		this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
		this.fetchImpl = resolveFetch(config.fetch);
	}

	private get headers(): Record<string, string> {
		return { authorization: `Bearer ${this.apiKey}` };
	}

	async provision(input: ProvisionInput): Promise<ProvisionedHost> {
		const ttlMs =
			input.kind === "sandbox"
				? (input.ttlMs ?? DEFAULT_SANDBOX_TTL_MS)
				: undefined;

		const res = await jsonRequest<DaytonaWorkspaceResponse>(
			this.fetchImpl,
			`${this.baseUrl}/workspace`,
			{
				method: "POST",
				headers: this.headers,
				body: {
					name: input.label,
					target: input.region,
					autoStopInterval:
						ttlMs === undefined ? 0 : Math.round(ttlMs / 60_000),
				},
			},
		);

		const expiresAt =
			ttlMs === undefined ? null : new Date(Date.now() + ttlMs).toISOString();

		return {
			id: res.id,
			provider: this.provider,
			kind: input.kind,
			host: res.runnerDomain ?? `${res.id}.daytona.io`,
			port: res.port ?? 443,
			protocol: "https",
			expiresAt: res.expiresAt ?? expiresAt,
		};
	}

	async destroy(id: string): Promise<void> {
		await jsonRequest<void>(this.fetchImpl, `${this.baseUrl}/workspace/${id}`, {
			method: "DELETE",
			headers: this.headers,
		});
	}

	async status(id: string): Promise<HostStatus> {
		const res = await jsonRequest<DaytonaWorkspaceResponse>(
			this.fetchImpl,
			`${this.baseUrl}/workspace/${id}`,
			{ method: "GET", headers: this.headers },
		);
		return {
			id: res.id,
			state: mapState(res.state),
			expiresAt: res.expiresAt ?? null,
		};
	}
}
