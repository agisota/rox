import { isTemplateInstallable } from "@rox/shared/template-permissions-manifest";
import type { ProjectTemplate } from "./templates";

/**
 * What should happen when the create flow is about to provision a project from a
 * template. With the Permissions Manifest experiment enabled+available, an
 * installable template first routes through its pre-install confirm step
 * ("manifest"); otherwise the flow creates the project immediately ("create"),
 * preserving the original (no-regression) behaviour. Non-installable templates
 * always create (the engine itself no-ops on them).
 *
 * Kept in a dependency-free module so the gating decision is unit-testable
 * without loading the renderer / tRPC / host-service stack — mirroring
 * `preview-sandbox-action.ts`.
 */
export type TemplateInstallAction = "manifest" | "create";

export function getTemplateInstallAction(
	template: ProjectTemplate,
	permissionsManifestEnabled: boolean,
): TemplateInstallAction {
	if (permissionsManifestEnabled && isTemplateInstallable(template)) {
		return "manifest";
	}
	return "create";
}
