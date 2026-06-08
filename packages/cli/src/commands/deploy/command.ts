import * as p from "@clack/prompts";
import { boolean, CLIError, number, string } from "@rox/cli-framework";
import { command } from "../../lib/command";
import { ROX_CONFIG_PATH } from "../../lib/config";
import { spawnHostService } from "../../lib/host/spawn";

/**
 * `rox deploy` — provision a managed remote host / ephemeral sandbox via the
 * API, or self-deploy the host-service runtime on the current machine
 * (`--self`), reusing the same spawn/relay wiring as `rox start`.
 */
export default command({
	description:
		"Provision a remote host or sandbox, or self-deploy this machine",
	options: {
		kind: string()
			.enum("remote", "sandbox")
			.default("sandbox")
			.desc("Persistent remote workspace or ephemeral sandbox (~1h)"),
		provider: string()
			.enum("daytona", "modal", "e2b")
			.desc("Managed backend (required unless --self)"),
		name: string().desc("Host name"),
		region: string().desc("Provider region hint"),
		ttl: number().int().min(1).desc("Sandbox lifetime in minutes"),
		self: boolean().desc("Run the host service on this machine instead"),
		daemon: boolean().desc("Run the self-deploy host service in background"),
		port: number().desc("Port for the self-deploy host service"),
	},
	run: async ({ ctx, options, signal }) => {
		const organization = await ctx.api.user.myOrganization.query();
		if (!organization) {
			throw new CLIError("No active organization", "Run: rox auth login");
		}

		// --- Self-deploy: run the host-service runtime here. ---
		if (options.self) {
			p.intro(`rox deploy --self (${organization.name})`);
			const spinner = p.spinner();
			spinner.start("Starting host service...");
			try {
				const result = await spawnHostService({
					organizationId: organization.id,
					sessionToken: ctx.bearer,
					authConfigPath:
						ctx.authSource === "oauth" ? ROX_CONFIG_PATH : undefined,
					api: ctx.api,
					port: options.port,
					daemon: options.daemon ?? false,
				});
				spinner.stop(
					`Host service running on port ${result.port} (pid ${result.pid})`,
				);
				p.outro(
					options.daemon ? "Running in background." : "Press Ctrl+C to stop.",
				);

				if (!options.daemon) {
					await new Promise<void>((resolve) => {
						signal.addEventListener("abort", () => resolve(), { once: true });
					});
				}

				return {
					data: {
						pid: result.pid,
						port: result.port,
						organizationId: organization.id,
						kind: "local" as const,
					},
					message: `Host service ${
						options.daemon ? "started" : "stopped"
					} for ${organization.name}`,
				};
			} catch (error) {
				spinner.stop("Failed to start host service");
				throw new CLIError(
					error instanceof Error ? error.message : "Unknown error",
				);
			}
		}

		// --- Managed provision via the API. ---
		if (!options.provider) {
			throw new CLIError(
				"--provider is required when provisioning a managed host",
				"Pass --provider daytona|modal|e2b, or use --self",
			);
		}

		const name = options.name?.trim() || `${options.provider}-${options.kind}`;
		const ttlMs = options.ttl ? options.ttl * 60_000 : undefined;

		p.intro(`rox deploy (${organization.name})`);
		const spinner = p.spinner();
		spinner.start(`Provisioning ${options.kind} on ${options.provider}...`);

		try {
			const host = await ctx.api.v2Host.provision.mutate({
				name,
				kind: options.kind,
				provider: options.provider,
				region: options.region ?? undefined,
				ttlMs,
			});
			const address =
				host.port != null
					? `${host.protocol ?? "https"}://${host.machineId}:${host.port}`
					: host.machineId;
			spinner.stop(`Provisioned ${host.name}`);
			p.outro(
				host.expiresAt
					? `Sandbox ${address} expires ${new Date(host.expiresAt).toLocaleString()}`
					: `Remote host ready at ${address}`,
			);

			return {
				data: {
					id: host.machineId,
					name: host.name,
					kind: host.kind,
					provider: host.provider,
					port: host.port,
					protocol: host.protocol,
					expiresAt: host.expiresAt,
				},
				message: `Deployed ${host.name}`,
			};
		} catch (error) {
			spinner.stop("Failed to provision host");
			throw new CLIError(
				error instanceof Error ? error.message : "Unknown error",
			);
		}
	},
});
