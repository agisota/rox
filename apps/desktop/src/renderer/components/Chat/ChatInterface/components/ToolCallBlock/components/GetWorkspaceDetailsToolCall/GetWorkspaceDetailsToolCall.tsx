import { InfoIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { RoxToolCall } from "../RoxToolCall";

interface GetWorkspaceDetailsToolCallProps {
	part: ToolPart;
}

export function GetWorkspaceDetailsToolCall({
	part,
}: GetWorkspaceDetailsToolCallProps) {
	return (
		<RoxToolCall
			part={part}
			toolName="Get workspace details"
			icon={InfoIcon}
		/>
	);
}
