import { registerProvider } from "../core/registry";
import { actionsProvider } from "./actions/commands";
import { agentNativeProvider } from "./agentNative/commands";
import { canvasCommandsProvider } from "./canvas/commands";
import { navigationProvider } from "./navigation/commands";
import { openInProvider } from "./openIn/commands";
import { settingsItemsProvider } from "./settings/commands";
import { workspaceProvider } from "./workspace/commands";

export function registerAllModules(): () => void {
	const unregisters = [
		registerProvider(workspaceProvider),
		registerProvider(actionsProvider),
		registerProvider(agentNativeProvider),
		registerProvider(canvasCommandsProvider),
		registerProvider(openInProvider),
		registerProvider(navigationProvider),
		registerProvider(settingsItemsProvider),
	];
	return () => {
		for (const u of unregisters) u();
	};
}
