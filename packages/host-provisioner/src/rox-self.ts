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

/**
 * Default Docker Engine TCP endpoint. The Docker daemon must expose its HTTP
 * API on a reachable host (e.g. `tcp://0.0.0.0:2375` via `-H`); there is no
 * default TCP socket, so this is only a placeholder for local testing.
 */
const DEFAULT_BASE_URL = "http://dockerbox:2375";

/**
 * Published image for the host-service container. The CI/CD pipeline builds
 * `packages/host-service/Dockerfile` and pushes it under this tag; override per
 * environment with `ROX_SELF_HOST_IMAGE`.
 */
const DEFAULT_HOST_IMAGE = "ghcr.io/agisota/rox-host-service:latest";

/** Container port the host-service listens on inside the image. */
const HOST_SERVICE_PORT = 4879;

/** Docker labels stamped on every container we create, for discovery/cleanup. */
const LABEL_KIND = "rox.kind";
const LABEL_NAME = "rox.label";

interface DockerCreateResponse {
	Id: string;
	Warnings?: string[] | null;
}

interface DockerPortBinding {
	HostIp?: string;
	HostPort?: string;
}

interface DockerInspectResponse {
	Id: string;
	State?: { Status?: string };
	NetworkSettings?: {
		IPAddress?: string;
		Ports?: Record<string, DockerPortBinding[] | null> | null;
	};
}

function mapState(status: string | undefined): HostStatusState {
	switch (status) {
		case "running":
			return "running";
		case "created":
		case "restarting":
			return "provisioning";
		case "exited":
		case "dead":
		case "paused":
			return "stopped";
		default:
			return "unknown";
	}
}

/** Hostname of the Docker daemon, used when a binding has no concrete HostIp. */
function dockerHostname(baseUrl: string): string {
	try {
		return new URL(baseUrl).hostname || "127.0.0.1";
	} catch {
		return "127.0.0.1";
	}
}

/**
 * Read the published host/port for the host-service container from a Docker
 * inspect payload. With `PublishAllPorts`, Docker maps the exposed container
 * port to an ephemeral host port surfaced in `NetworkSettings.Ports`.
 */
function readPublishedAddress(
	inspect: DockerInspectResponse,
	baseUrl: string,
): { host: string; port: number } {
	const ports = inspect.NetworkSettings?.Ports ?? {};
	const binding =
		ports[`${HOST_SERVICE_PORT}/tcp`]?.[0] ??
		Object.values(ports).find((b): b is DockerPortBinding[] =>
			Boolean(b && b.length > 0),
		)?.[0];

	const fallbackHost = dockerHostname(baseUrl);
	const bindingHost =
		binding?.HostIp && binding.HostIp !== "0.0.0.0"
			? binding.HostIp
			: fallbackHost;
	const port = binding?.HostPort
		? Number.parseInt(binding.HostPort, 10)
		: HOST_SERVICE_PORT;

	return { host: bindingHost, port };
}

/**
 * `rox-self` adapter (path B), provider discriminant `"self"`. Provisions a
 * host-service container on a Docker box we control via the Docker Engine HTTP
 * API (TCP endpoint). Fetch-only, no Docker SDK. The default TCP API is
 * unauthenticated, so `apiKey` is unused (kept to satisfy
 * {@link ProvisionerConfig}); the gating credential is the configured
 * `ROX_SELF_DOCKER_HOST` endpoint itself.
 */
export class RoxSelfProvisioner implements HostProvisioner {
	readonly provider = "self" as const;
	private readonly baseUrl: string;
	private readonly fetchImpl: FetchLike;

	constructor(config: ProvisionerConfig) {
		// `config.apiKey` is intentionally ignored: Docker's default TCP API is
		// unauthenticated. The field is still accepted so callers can pass the
		// shared `ProvisionerConfig` shape (apiKey may be an empty string).
		this.baseUrl = (
			config.baseUrl ??
			process.env.ROX_SELF_DOCKER_HOST ??
			DEFAULT_BASE_URL
		).replace(/\/$/, "");
		this.fetchImpl = resolveFetch(config.fetch);
	}

	private get image(): string {
		return process.env.ROX_SELF_HOST_IMAGE ?? DEFAULT_HOST_IMAGE;
	}

	async provision(input: ProvisionInput): Promise<ProvisionedHost> {
		const ttlMs =
			input.kind === "sandbox"
				? (input.ttlMs ?? DEFAULT_SANDBOX_TTL_MS)
				: undefined;

		const created = await jsonRequest<DockerCreateResponse>(
			this.fetchImpl,
			`${this.baseUrl}/containers/create`,
			{
				method: "POST",
				body: {
					Image: this.image,
					Labels: {
						[LABEL_KIND]: input.kind,
						[LABEL_NAME]: input.label ?? "",
					},
					HostConfig: { PublishAllPorts: true },
				},
			},
		);

		await jsonRequest<void>(
			this.fetchImpl,
			`${this.baseUrl}/containers/${created.Id}/start`,
			{ method: "POST" },
		);

		const inspect = await jsonRequest<DockerInspectResponse>(
			this.fetchImpl,
			`${this.baseUrl}/containers/${created.Id}/json`,
			{ method: "GET" },
		);

		const { host, port } = readPublishedAddress(inspect, this.baseUrl);

		return {
			id: created.Id,
			provider: this.provider,
			kind: input.kind,
			host,
			port,
			protocol: "https",
			expiresAt:
				ttlMs === undefined ? null : new Date(Date.now() + ttlMs).toISOString(),
		};
	}

	async destroy(id: string): Promise<void> {
		await jsonRequest<void>(
			this.fetchImpl,
			`${this.baseUrl}/containers/${id}?force=true&v=true`,
			{ method: "DELETE" },
		);
	}

	async status(id: string): Promise<HostStatus> {
		const inspect = await jsonRequest<DockerInspectResponse>(
			this.fetchImpl,
			`${this.baseUrl}/containers/${id}/json`,
			{ method: "GET" },
		);
		return {
			id: inspect.Id,
			state: mapState(inspect.State?.Status),
			expiresAt: null,
		};
	}
}
