import { executeCommand as executeSharedCommand } from "@rox/shared/command-palette";
import { toast } from "@rox/ui/sonner";
import { track } from "renderer/lib/analytics";
import type { Command, CommandContext } from "./types";

export async function executeCommand(
	command: Command,
	context: CommandContext,
): Promise<void> {
	await executeSharedCommand(command, context, {
		track: (event, props) => track(event, props),
		notifyInfo: (message) => toast.info(message),
		notifyError: (message) => toast.error(message),
	});
}
