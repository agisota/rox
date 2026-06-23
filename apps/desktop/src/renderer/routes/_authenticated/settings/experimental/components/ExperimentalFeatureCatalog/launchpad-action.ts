import type { ExperimentalFeatureId } from "@rox/shared/experimental-features";

/**
 * How a launchpad "Open" button behaves. Features with a real, gated surface
 * navigate into it; the rest still scroll to their toggle card until their
 * surface is built. Kept in a dependency-free module so the routing is
 * unit-testable without loading the renderer/tRPC stack.
 */
export type LaunchpadAction = "open-template-gallery" | "scroll-to-card";

export function getLaunchpadAction(id: ExperimentalFeatureId): LaunchpadAction {
	if (id === "templates.marketplace") return "open-template-gallery";
	return "scroll-to-card";
}
