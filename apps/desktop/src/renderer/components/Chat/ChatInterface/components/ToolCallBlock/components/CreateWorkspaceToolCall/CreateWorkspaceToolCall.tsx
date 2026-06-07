import { FolderPlusIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { RoxToolCall } from "../RoxToolCall";

interface CreateWorkspaceToolCallProps {
	part: ToolPart;
}

export function CreateWorkspaceToolCall({
	part,
}: CreateWorkspaceToolCallProps) {
	return (
		<RoxToolCall
			part={part}
			toolName="Create workspace"
			icon={FolderPlusIcon}
		/>
	);
}
