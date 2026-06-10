import { FolderTreeIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { RoxToolCall } from "../RoxToolCall";

interface ListWorkspacesToolCallProps {
	part: ToolPart;
}

export function ListWorkspacesToolCall({ part }: ListWorkspacesToolCallProps) {
	return (
		<RoxToolCall part={part} toolName="List workspaces" icon={FolderTreeIcon} />
	);
}
