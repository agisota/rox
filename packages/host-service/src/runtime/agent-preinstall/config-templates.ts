/**
 * Bodies for harness config files, keyed by the `templateRef` declared in
 * `AGENT_HARNESS_PRESETS[].configFiles`. Kept here (host-service) rather than
 * in the shared catalog so large template literals don't ship through the
 * shared package.
 */
const OPEN_DYNAMIC_WORKFLOWS_OMP_CONFIG = `${JSON.stringify(
	{
		defaultAdapter: "omp",
		concurrency: 4,
		maxAgents: 64,
		workspaceMode: "copy",
		timeout: 1800,
		schemaRetries: 2,
		runsRoot: "~/.odw/runs",
		adapters: {
			omp: {
				label: "Oh My Pi",
				command: [
					"omp",
					"--cwd",
					"{workspace}",
					"--auto-approve",
					"-p",
					"{prompt}",
				],
				stdin: null,
				timeout: 1800,
			},
		},
	},
	null,
	2,
)}\n`;

export const HARNESS_CONFIG_TEMPLATES: Readonly<Record<string, string>> = {
	"open-dynamic-workflows-omp": OPEN_DYNAMIC_WORKFLOWS_OMP_CONFIG,
};

export function getConfigTemplate(templateRef: string): string | undefined {
	return HARNESS_CONFIG_TEMPLATES[templateRef];
}
