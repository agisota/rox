import { FolderKanbanIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { RoxToolCall } from "../RoxToolCall";

interface ListProjectsToolCallProps {
	part: ToolPart;
}

export function ListProjectsToolCall({ part }: ListProjectsToolCallProps) {
	return (
		<RoxToolCall part={part} toolName="List projects" icon={FolderKanbanIcon} />
	);
}
