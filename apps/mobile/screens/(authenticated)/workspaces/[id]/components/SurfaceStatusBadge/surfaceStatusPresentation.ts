import type { WorkspaceSurfaceStatus } from "@rox/shared/workspace-status";

/** Badge variants available in the mobile UI kit. */
export type SurfaceBadgeVariant =
	| "default"
	| "secondary"
	| "destructive"
	| "outline";

export interface SurfaceStatusPresentation {
	/** Short human label shown in the badge. */
	label: string;
	/** UI-kit badge variant. */
	variant: SurfaceBadgeVariant;
	/** Whether the badge should pulse (respect reduced-motion at the edge). */
	pulse: boolean;
}

/**
 * Map a workspace surface status to its badge presentation. Pure + exhaustive so
 * adding a status to the union is a compile error here, and the label/variant
 * choices are unit-tested without rendering React Native.
 */
export function surfaceStatusPresentation(
	status: WorkspaceSurfaceStatus,
): SurfaceStatusPresentation {
	switch (status) {
		case "live":
			return { label: "Live", variant: "default", pulse: true };
		case "connecting":
			return { label: "Connecting", variant: "secondary", pulse: true };
		case "idle":
			return { label: "Idle", variant: "outline", pulse: false };
		case "ended":
			return { label: "Ended", variant: "secondary", pulse: false };
		case "error":
			return { label: "Error", variant: "destructive", pulse: false };
		case "unavailable":
			return { label: "Unavailable", variant: "outline", pulse: false };
		default: {
			// Exhaustiveness guard: a new status must be handled above.
			const _never: never = status;
			return { label: _never, variant: "outline", pulse: false };
		}
	}
}
