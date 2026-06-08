export {
	buildPreinstallCatalog,
	type PreinstallCatalogItem,
	type PreinstallItemKind,
	resolveAutoInstallPlan,
	shouldAutoInstall,
} from "./install-plan";
export {
	AgentPreinstaller,
	type AgentPreinstallerOptions,
	type CommandResult,
	type CommandRunner,
	type PreinstallItemResult,
	type PreinstallProgressEvent,
	type PreinstallStatusEntry,
} from "./installer";
