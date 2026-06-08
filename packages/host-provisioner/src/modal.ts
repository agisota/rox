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

const DEFAULT_BASE_URL = "https://api.modal.com/v1";

interface ModalSandboxResponse {
	sandbox_id: string;
	status?: string;
	tunnel_host?: string;
	tunnel_port?: number;
	expires_at?: string | null;
}

function mapState(status: string | undefined): HostStatusState {
	switch (status) {
		case "RUNNING":
			return "running";
		case "PENDING":
		case "STARTING":
			return "provisioning";
		case "TERMINATED":
		case "STOPPED":
			return "stopped";
		default:
			return "unknown";
	}
}

/**
 * Modal adapter. Uses Modal sandboxes with a `timeout` for ephemeral spend
 * control; persistent `remote` hosts are created without a timeout.
 */
export class ModalProvisioner implements HostProvisioner {
	readonly provider = "modal" as const;
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

		const res = await jsonRequest<ModalSandboxResponse>(
			this.fetchImpl,
			`${this.baseUrl}/sandboxes`,
			{
				method: "POST",
				headers: this.headers,
				body: {
					name: input.label,
					region: input.region,
					timeout: ttlMs === undefined ? undefined : Math.round(ttlMs / 1000),
				},
			},
		);

		const expiresAt =
			ttlMs === undefined ? null : new Date(Date.now() + ttlMs).toISOString();

		return {
			id: res.sandbox_id,
			provider: this.provider,
			kind: input.kind,
			host: res.tunnel_host ?? `${res.sandbox_id}.modal.host`,
			port: res.tunnel_port ?? 443,
			protocol: "https",
			expiresAt: res.expires_at ?? expiresAt,
		};
	}

	async destroy(id: string): Promise<void> {
		await jsonRequest<void>(
			this.fetchImpl,
			`${this.baseUrl}/sandboxes/${id}/terminate`,
			{ method: "POST", headers: this.headers },
		);
	}

	async status(id: string): Promise<HostStatus> {
		const res = await jsonRequest<ModalSandboxResponse>(
			this.fetchImpl,
			`${this.baseUrl}/sandboxes/${id}`,
			{ method: "GET", headers: this.headers },
		);
		return {
			id: res.sandbox_id,
			state: mapState(res.status),
			expiresAt: res.expires_at ?? null,
		};
	}
}
