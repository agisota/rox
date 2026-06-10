import { MonitorSmartphoneIcon } from "lucide-react";
import type { ToolPart } from "../../../../utils/tool-helpers";
import { RoxToolCall } from "../RoxToolCall";

interface ListDevicesToolCallProps {
	part: ToolPart;
}

export function ListDevicesToolCall({ part }: ListDevicesToolCallProps) {
	return (
		<RoxToolCall
			part={part}
			toolName="List devices"
			icon={MonitorSmartphoneIcon}
		/>
	);
}
