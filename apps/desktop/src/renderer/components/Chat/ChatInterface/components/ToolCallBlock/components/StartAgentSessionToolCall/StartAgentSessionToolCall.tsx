import { BotIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { RoxToolCall } from "../RoxToolCall";

interface StartAgentSessionToolCallProps {
	part: ToolPart;
	toolName?: string;
}

export function StartAgentSessionToolCall({
	part,
	toolName = "Start agent session",
}: StartAgentSessionToolCallProps) {
	return <RoxToolCall part={part} toolName={toolName} icon={BotIcon} />;
}
