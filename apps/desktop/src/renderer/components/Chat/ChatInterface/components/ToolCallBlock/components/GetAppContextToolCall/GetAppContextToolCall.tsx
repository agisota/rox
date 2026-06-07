import { AppWindowIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { RoxToolCall } from "../RoxToolCall";

interface GetAppContextToolCallProps {
	part: ToolPart;
}

export function GetAppContextToolCall({ part }: GetAppContextToolCallProps) {
	return (
		<RoxToolCall part={part} toolName="Get app context" icon={AppWindowIcon} />
	);
}
