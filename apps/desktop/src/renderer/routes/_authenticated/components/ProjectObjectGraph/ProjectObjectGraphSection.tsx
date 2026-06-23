import { Button } from "@rox/ui/button";
import { useState } from "react";
import { LuChevronDown, LuChevronRight, LuNetwork } from "react-icons/lu";
import { useExperimentalFeature } from "renderer/hooks/useExperimentalFeature";
import { ProjectObjectGraphLaunchpad } from "./ProjectObjectGraphLaunchpad";

export interface ProjectObjectGraphSectionProps {
	/** The v2_project this section operates on. */
	v2ProjectId: string;
}

/**
 * Collapsible "Project OS" entry rendered under a project header in the
 * workspaces list. The toggle only appears when `projectOs.workspaceShell`
 * resolves `available` (the gate), so users without the experiment see nothing.
 * Expanding reveals the gated {@link ProjectObjectGraphLaunchpad}.
 */
export function ProjectObjectGraphSection({
	v2ProjectId,
}: ProjectObjectGraphSectionProps) {
	const { state } = useExperimentalFeature("projectOs.workspaceShell");
	const [open, setOpen] = useState(false);

	// Mirror the gate's usability check so the toggle is hidden when the surface
	// would render nothing anyway (off / not available).
	const usable = state.enabled && state.availability === "available";
	if (!usable) return null;

	return (
		<div className="px-4 pb-2">
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="h-7 gap-1.5 px-1.5 text-xs text-foreground/70"
				onClick={() => setOpen((value) => !value)}
				aria-expanded={open}
			>
				{open ? (
					<LuChevronDown className="size-3.5" aria-hidden />
				) : (
					<LuChevronRight className="size-3.5" aria-hidden />
				)}
				<LuNetwork className="size-3.5" aria-hidden />
				Project OS — граф объектов
			</Button>

			{open ? (
				<div className="mt-2 rounded-md border border-border/50 p-3">
					<ProjectObjectGraphLaunchpad v2ProjectId={v2ProjectId} />
				</div>
			) : null}
		</div>
	);
}
