import type { AgentAttachment } from "shared/browser";

/**
 * Decoupled renderer event bus for Design Mode captures. The Browser pane
 * publishes a formatted {@link AgentAttachment}; interested consumers (e.g. a
 * focused chat composer) can subscribe without the Browser pane reaching into
 * another pane's session/transport. The clipboard hand-off is the always-on path
 * for CLI agents; this bus is the seam for richer auto-insertion later.
 */
export const DESIGN_CAPTURE_EVENT = "rox:design-capture";

export type DesignCaptureEventDetail = {
	workspaceId: string;
	browserSessionId: string;
	attachment: AgentAttachment;
};

export function publishDesignCapture(detail: DesignCaptureEventDetail): void {
	window.dispatchEvent(
		new CustomEvent<DesignCaptureEventDetail>(DESIGN_CAPTURE_EVENT, { detail }),
	);
}

export function subscribeDesignCapture(
	handler: (detail: DesignCaptureEventDetail) => void,
): () => void {
	const listener = (event: Event) => {
		handler((event as CustomEvent<DesignCaptureEventDetail>).detail);
	};
	window.addEventListener(DESIGN_CAPTURE_EVENT, listener);
	return () => window.removeEventListener(DESIGN_CAPTURE_EVENT, listener);
}
