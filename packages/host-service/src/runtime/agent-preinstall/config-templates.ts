/**
 * Bodies for harness config files, keyed by the `templateRef` declared in
 * `AGENT_HARNESS_PRESETS[].configFiles`. Kept here (host-service) rather than
 * in the shared catalog so large template literals don't ship through the
 * shared package. Empty until a harness declares a config file with a
 * verified body.
 */
export const HARNESS_CONFIG_TEMPLATES: Readonly<Record<string, string>> = {};

export function getConfigTemplate(templateRef: string): string | undefined {
	return HARNESS_CONFIG_TEMPLATES[templateRef];
}
