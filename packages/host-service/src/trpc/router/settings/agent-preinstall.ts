import { z } from "zod";
import { logger } from "../../../lib/logger";
import type { PreinstallStatusEntry } from "../../../runtime/agent-preinstall";
import { protectedProcedure, router } from "../../index";

export type { PreinstallStatusEntry };

/**
 * Drives the bundled agent/harness preinstaller. `status` reads persisted
 * progress; `run`/`retry` kick off installs without blocking the response
 * (the renderer polls `status`); `skip` opts an item out of auto-install.
 */
export const agentPreinstallRouter = router({
	/** Catalog joined with per-item install state. */
	status: protectedProcedure.query(({ ctx }) => {
		return ctx.runtime.preinstall.getStatus();
	}),

	/** Fire-and-forget auto-install of every pending, non-optional item. */
	run: protectedProcedure.mutation(({ ctx }) => {
		void ctx.runtime.preinstall.runAuto().catch((error) => {
			logger.warn("[host-service] agent preinstall run failed:", error);
		});
		return { started: true as const };
	}),

	/** Force a (re)install of a single item — used by the retry button. */
	retry: protectedProcedure
		.input(z.object({ presetId: z.string().min(1) }))
		.mutation(({ ctx, input }) => {
			void ctx.runtime.preinstall.runOne(input.presetId).catch((error) => {
				logger.warn(
					`[host-service] agent preinstall retry failed for ${input.presetId}:`,
					error,
				);
			});
			return { started: true as const };
		}),

	/** Opt an item out of auto-install. */
	skip: protectedProcedure
		.input(z.object({ presetId: z.string().min(1) }))
		.mutation(({ ctx, input }) => {
			const skipped = ctx.runtime.preinstall.skip(input.presetId);
			return { skipped };
		}),
});
