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

const DEFAULT_BASE_URL = "https://api.e2b.dev";

interface E2BSandboxResponse {
	sandboxID: string;
	state?: string;
	domain?: string;
	port?: number;
	endAt?: string | null;
}

function mapState(state: string | undefined): HostStatusState {
	switch (state) {
		case "running":
			return "running";
		case "pending":
			return "provisioning";
		case "paused":
		case "killed":
			return "stopped";
		default:
			return "unknown";
	}
}

/**
 * E2B adapter. E2B sandboxes are ephemeral by design; `remote` requests are
 * given a long-lived timeout while `sandbox` requests honor the ~1h TTL.
 */
export class E2BProvisioner implements HostProvisioner {
	readonly provider = "e2b" as const;
	private readonly apiKey: string;
	private readonly baseUrl: string;
	private readonly fetchImpl: FetchLike;

	constructor(config: ProvisionerConfig) {
		this.apiKey = config.apiKey;
		this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
		this.fetchImpl = resolveFetch(config.fetch);
	}

	private get headers(): Record<string, string> {
		return { "x-api-key": this.apiKey };
	}

	async provision(input: ProvisionInput): Promise<ProvisionedHost> {
		const ttlMs =
			input.kind === "sandbox"
				? (input.ttlMs ?? DEFAULT_SANDBOX_TTL_MS)
				: undefined;

		const res = await jsonRequest<E2BSandboxResponse>(
			this.fetchImpl,
			`${this.baseUrl}/sandboxes`,
			{
				method: "POST",
				headers: this.headers,
				body: {
					metadata: input.label ? { label: input.label } : undefined,
					timeoutMs: ttlMs,
				},
			},
		);

		const expiresAt =
			ttlMs === undefined ? null : new Date(Date.now() + ttlMs).toISOString();

		return {
			id: res.sandboxID,
			provider: this.provider,
			kind: input.kind,
			host: res.domain ?? `${res.sandboxID}.e2b.dev`,
			port: res.port ?? 443,
			protocol: "https",
			expiresAt: res.endAt ?? expiresAt,
		};
	}

	async destroy(id: string): Promise<void> {
		await jsonRequest<void>(this.fetchImpl, `${this.baseUrl}/sandboxes/${id}`, {
			method: "DELETE",
			headers: this.headers,
		});
	}

	async status(id: string): Promise<HostStatus> {
		const res = await jsonRequest<E2BSandboxResponse>(
			this.fetchImpl,
			`${this.baseUrl}/sandboxes/${id}`,
			{ method: "GET", headers: this.headers },
		);
		return {
			id: res.sandboxID,
			state: mapState(res.state),
			expiresAt: res.endAt ?? null,
		};
	}
}
