import { PencilLineIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { RoxToolCall } from "../RoxToolCall";

interface UpdateWorkspaceToolCallProps {
	part: ToolPart;
}

export function UpdateWorkspaceToolCall({
	part,
}: UpdateWorkspaceToolCallProps) {
	return (
		<RoxToolCall
			part={part}
			toolName="Update workspace"
			icon={PencilLineIcon}
		/>
	);
}
