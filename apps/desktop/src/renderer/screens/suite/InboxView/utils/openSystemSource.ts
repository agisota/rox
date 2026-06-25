import type { useNavigate } from "@tanstack/react-router";
import type { SystemAction } from "../types";

/**
 * Resolve a {@link SystemAction} into the real renderer-edge effect: open the PR
 * URL in the browser, or navigate to the workspace / automation detail. Shared
 * by the reader card's primary button and the reader header's kebab so both
 * "go to source" entry points behave identically. Platform-neutral inputs (a
 * tagged action), platform effects (`window.open` / router navigate) at the edge.
 */
export function openSystemSource(
	action: SystemAction,
	navigate: ReturnType<typeof useNavigate>,
): void {
	switch (action.kind) {
		case "open-pr":
			window.open(action.url, "_blank", "noopener,noreferrer");
			return;
		case "open-workspace":
		case "reply-agent":
			void navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: action.workspaceId },
			});
			return;
		case "open-automation":
			void navigate({
				to: "/automations/$automationId",
				params: { automationId: action.automationId },
			});
			return;
	}
}
