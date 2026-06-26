import { z } from "zod";
import { hostSettings } from "../../../db/schema";
import { protectedProcedure, router } from "../../index";
import {
	defaultProjectsRoot,
	normalizeWorktreeBaseDir,
} from "../workspace-creation/shared/worktree-paths";
import { getHostProjectsBaseDir, HOST_SETTINGS_ID } from "./host-settings";

export interface HostProjectsLocationSettings {
	projectsBaseDir: string | null;
	defaultProjectsBaseDir: string;
}

function toOutput(
	projectsBaseDir: string | null,
): HostProjectsLocationSettings {
	return {
		projectsBaseDir,
		defaultProjectsBaseDir: defaultProjectsRoot(),
	};
}

export const projectsLocationRouter = router({
	get: protectedProcedure.query(({ ctx }) =>
		toOutput(getHostProjectsBaseDir(ctx.db)),
	),

	set: protectedProcedure
		.input(z.object({ path: z.string().nullable() }))
		.mutation(({ ctx, input }) => {
			// Same normalization as worktree location: absolute or `~`-relative.
			const projectsBaseDir = normalizeWorktreeBaseDir(input.path);
			ctx.db
				.insert(hostSettings)
				.values({ id: HOST_SETTINGS_ID, projectsBaseDir })
				.onConflictDoUpdate({
					target: hostSettings.id,
					set: { projectsBaseDir },
				})
				.run();
			return toOutput(projectsBaseDir);
		}),
});
