import { Trash2Icon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { RoxToolCall } from "../RoxToolCall";

interface DeleteWorkspaceToolCallProps {
	part: ToolPart;
}

export function DeleteWorkspaceToolCall({
	part,
}: DeleteWorkspaceToolCallProps) {
	return (
		<RoxToolCall
			part={part}
			toolName="Delete workspace"
			icon={Trash2Icon}
		/>
	);
}
