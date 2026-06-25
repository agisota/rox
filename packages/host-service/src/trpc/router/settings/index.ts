import { router } from "../../index";
import { agentConfigsRouter } from "./agent-configs";
import { agentPreinstallRouter } from "./agent-preinstall";
import { branchPrefixRouter } from "./branch-prefix";
import { localFirstRouter } from "./local-first";
import { projectsLocationRouter } from "./projects-location";
import { roleModelRouter } from "./role-model";
import { worktreeLocationRouter } from "./worktree-location";

export const settingsRouter = router({
	agentConfigs: agentConfigsRouter,
	agentPreinstall: agentPreinstallRouter,
	branchPrefix: branchPrefixRouter,
	localFirst: localFirstRouter,
	projectsLocation: projectsLocationRouter,
	roleModel: roleModelRouter,
	worktreeLocation: worktreeLocationRouter,
});

export type { HostAgentConfig } from "./agent-configs";
export type { PreinstallStatusEntry } from "./agent-preinstall";
export type { HostLocalFirstSettings } from "./local-first";
export type { HostProjectsLocationSettings } from "./projects-location";
export type { HostRoleModelSettings } from "./role-model";
export type { HostWorktreeLocationSettings } from "./worktree-location";
