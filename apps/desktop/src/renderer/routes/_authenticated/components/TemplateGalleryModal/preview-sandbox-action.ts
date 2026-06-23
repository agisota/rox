import { isTemplatePreviewable } from "@rox/shared/template-preview-sandbox";
import type { ProjectTemplate } from "./templates";

/**
 * What a template-card click should do. With the Template Preview Sandbox
 * experiment enabled+available, a previewable template opens its dry-run preview
 * first ("preview"); otherwise the click applies the template immediately
 * ("apply"), preserving the original gallery behaviour. Non-previewable
 * templates always apply (the engine itself no-ops on them).
 *
 * Kept in a dependency-free module so the gating decision is unit-testable
 * without loading the renderer / tRPC / host-service stack — mirroring
 * `launchpad-action.ts`.
 */
export type TemplateSelectAction = "preview" | "apply";

export function getTemplateSelectAction(
	template: ProjectTemplate,
	previewSandboxEnabled: boolean,
): TemplateSelectAction {
	if (previewSandboxEnabled && isTemplatePreviewable(template)) {
		return "preview";
	}
	return "apply";
}
