import { z } from "zod";
import { hostSettings } from "../../../db/schema";
import { protectedProcedure, router } from "../../index";
import {
	DEFAULT_AUTO_INIT_GIT,
	DEFAULT_LOCAL_FIRST_CREATE,
	getHostAutoInitGit,
	getHostLocalFirstCreate,
	HOST_SETTINGS_ID,
} from "./host-settings";

export interface HostLocalFirstSettings {
	/** Instant local-first create (vs today's synchronous-cloud + rollback). */
	localFirstCreate: boolean;
	/** Auto-run `git init` for a folder that isn't a repo yet. */
	autoInitGit: boolean;
	/** The safe defaults a null column resolves to. */
	defaultLocalFirstCreate: boolean;
	defaultAutoInitGit: boolean;
}

function toOutput(
	localFirstCreate: boolean,
	autoInitGit: boolean,
): HostLocalFirstSettings {
	return {
		localFirstCreate,
		autoInitGit,
		defaultLocalFirstCreate: DEFAULT_LOCAL_FIRST_CREATE,
		defaultAutoInitGit: DEFAULT_AUTO_INIT_GIT,
	};
}

/**
 * Host-level create-path safety toggles. `localFirstCreate` is the maintainer's
 * roll-out switch for instant local-first create; it lives here (not in the
 * user-facing `experimental-features` registry) because host-service reads it
 * synchronously on the create call with no renderer round-trip — the same shape
 * as `worktreeBaseDir`/`branchPrefixMode`.
 */
export const localFirstRouter = router({
	get: protectedProcedure.query(({ ctx }) =>
		toOutput(getHostLocalFirstCreate(ctx.db), getHostAutoInitGit(ctx.db)),
	),

	set: protectedProcedure
		.input(
			z.object({
				localFirstCreate: z.boolean().optional(),
				autoInitGit: z.boolean().optional(),
			}),
		)
		.mutation(({ ctx, input }) => {
			// Only write the keys the caller actually provided, so flipping one
			// toggle never clobbers the other.
			const patch: {
				localFirstCreate?: boolean;
				autoInitGit?: boolean;
			} = {};
			if (input.localFirstCreate !== undefined) {
				patch.localFirstCreate = input.localFirstCreate;
			}
			if (input.autoInitGit !== undefined) {
				patch.autoInitGit = input.autoInitGit;
			}
			ctx.db
				.insert(hostSettings)
				.values({ id: HOST_SETTINGS_ID, ...patch })
				.onConflictDoUpdate({ target: hostSettings.id, set: patch })
				.run();
			return toOutput(
				getHostLocalFirstCreate(ctx.db),
				getHostAutoInitGit(ctx.db),
			);
		}),
});
