import { logger } from "../../../../lib/logger";
import type { GitClient } from "./types";

export async function enablePushAutoSetupRemote(
	git: GitClient,
	worktreePath: string,
	logPrefix: string,
): Promise<void> {
	await git
		.raw([
			"-C",
			worktreePath,
			"config",
			"--local",
			"push.autoSetupRemote",
			"true",
		])
		.catch((err) => {
			logger.warn(`${logPrefix} failed to set push.autoSetupRemote:`, err);
		});
}
