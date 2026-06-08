import { router } from "../../index";
import { agentConfigsRouter } from "./agent-configs";
import { agentPreinstallRouter } from "./agent-preinstall";
import { branchPrefixRouter } from "./branch-prefix";
import { worktreeLocationRouter } from "./worktree-location";

export const settingsRouter = router({
	agentConfigs: agentConfigsRouter,
	agentPreinstall: agentPreinstallRouter,
	branchPrefix: branchPrefixRouter,
	worktreeLocation: worktreeLocationRouter,
});

export type { HostAgentConfig } from "./agent-configs";
export type { PreinstallStatusEntry } from "./agent-preinstall";
export type { HostWorktreeLocationSettings } from "./worktree-location";
