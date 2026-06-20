"use client";

import { Button } from "@rox/ui/button";
import { Monitor } from "lucide-react";
import { buildContinueOnDesktopUrl } from "./buildContinueOnDesktopUrl";

type OpenInDesktopButtonProps = {
	workspaceId: string;
	routingKey: string;
};

/**
 * "Continue on desktop" affordance for the web cabinet (WS-B T8). Emits the
 * `rox://agents/workspace/:id?host=:routingKey` deep link that the desktop
 * picks up via `processDeepLink` (WS-A wires the renderer route). Rendered only
 * when the workspace is bound to a real host (a routing key exists).
 */
export function OpenInDesktopButton({
	workspaceId,
	routingKey,
}: OpenInDesktopButtonProps) {
	const href = buildContinueOnDesktopUrl(workspaceId, routingKey);
	return (
		<Button variant="outline" size="sm" asChild>
			<a href={href} data-testid="open-in-desktop">
				<Monitor className="size-4" />
				Открыть в десктопе
			</a>
		</Button>
	);
}
