import { ArrowRightLeftIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { RoxToolCall } from "../RoxToolCall";

interface SwitchWorkspaceToolCallProps {
	part: ToolPart;
}

export function SwitchWorkspaceToolCall({
	part,
}: SwitchWorkspaceToolCallProps) {
	return (
		<RoxToolCall
			part={part}
			toolName="Switch workspace"
			icon={ArrowRightLeftIcon}
		/>
	);
}
