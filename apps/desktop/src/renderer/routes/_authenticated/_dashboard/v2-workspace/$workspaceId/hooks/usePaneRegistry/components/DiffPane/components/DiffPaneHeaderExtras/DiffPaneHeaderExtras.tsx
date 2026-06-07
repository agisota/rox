import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { cn } from "@rox/ui/utils";
import {
	Eye,
	EyeOff,
	MessageSquare,
	MessageSquareOff,
	SquareSplitHorizontal,
} from "lucide-react";
import { useMemo } from "react";
import { TbScan } from "react-icons/tb";
import { useSettings } from "renderer/stores/settings";
import type { ChangesetFile } from "../../../../../useChangeset";
import { useChangeset } from "../../../../../useChangeset";
import { useSidebarDiffRef } from "../../../../../useSidebarDiffRef";
import { DiffPerformanceMeter } from "./DiffPerformanceMeter";

interface DiffPaneHeaderExtrasProps {
	workspaceId: string;
}

export function DiffPaneHeaderExtras({
	workspaceId,
}: DiffPaneHeaderExtrasProps) {
	const diffStyle = useSettings((s) => s.diffStyle);
	const showDiffComments = useSettings((s) => s.showDiffComments);
	const expandUnchanged = useSettings((s) => s.expandUnchanged);
	const updateSetting = useSettings((s) => s.update);

	const ref = useSidebarDiffRef(workspaceId);
	const { files } = useChangeset({ workspaceId, ref });
	const totalChanged = useMemo(
		() =>
			files.reduce(
				(n: number, f: ChangesetFile) => n + f.additions + f.deletions,
				0,
			),
		[files],
	);
	const isLarge = files.length > 40 || totalChanged > 2000;

	const buttonClass = (active: boolean) =>
		cn(
			"flex size-5 items-center justify-center transition-colors",
			active
				? "bg-secondary text-foreground"
				: "text-muted-foreground hover:text-foreground",
		);

	return (
		<div className="flex items-center">
			{isLarge && (
				<DiffPerformanceMeter
					totalChanged={totalChanged}
					fileCount={files.length}
					expandUnchanged={expandUnchanged}
					onHideUnchanged={() => updateSetting("expandUnchanged", false)}
				/>
			)}
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => updateSetting("diffStyle", "unified")}
						aria-label="Unified view"
						aria-pressed={diffStyle === "unified"}
						className={buttonClass(diffStyle === "unified")}
					>
						<TbScan className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Unified view
				</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => updateSetting("diffStyle", "split")}
						aria-label="Split view"
						aria-pressed={diffStyle === "split"}
						className={buttonClass(diffStyle === "split")}
					>
						<SquareSplitHorizontal className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					Split view
				</TooltipContent>
			</Tooltip>
			<div
				className="mx-1 h-3.5 w-px bg-muted-foreground/30"
				aria-hidden="true"
			/>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => updateSetting("showDiffComments", !showDiffComments)}
						aria-label={
							showDiffComments
								? "Hide PR review comments"
								: "Show PR review comments"
						}
						aria-pressed={showDiffComments}
						className={buttonClass(showDiffComments)}
					>
						{showDiffComments ? (
							<MessageSquare className="size-3.5" />
						) : (
							<MessageSquareOff className="size-3.5" />
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					{showDiffComments ? "Hide review comments" : "Show review comments"}
				</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						onClick={() => updateSetting("expandUnchanged", !expandUnchanged)}
						aria-label={
							expandUnchanged ? "Hide unchanged regions" : "Show all lines"
						}
						aria-pressed={expandUnchanged}
						className={buttonClass(expandUnchanged)}
					>
						{expandUnchanged ? (
							<EyeOff className="size-3.5" />
						) : (
							<Eye className="size-3.5" />
						)}
					</button>
				</TooltipTrigger>
				<TooltipContent side="bottom" showArrow={false}>
					{expandUnchanged ? "Hide unchanged regions" : "Show all lines"}
				</TooltipContent>
			</Tooltip>
			<div
				className="mx-1 h-3.5 w-px bg-muted-foreground/30"
				aria-hidden="true"
			/>
		</div>
	);
}
