import {
	parseRoleModelMapping,
	type RoleModelMapping,
	type RoleModelSelection,
} from "@rox/shared/agent-roles";
import { z } from "zod";
import { protectedProcedure, router } from "../../index";
import {
	getHostRoleModelMapping,
	resolveRoleModelForStep,
	setHostRoleModelMapping,
} from "./host-settings";

export interface HostRoleModelSettings {
	mapping: RoleModelMapping;
}

/**
 * Role→model routing settings (Ф3, #508). The renderer's onboarding role table
 * (Ф4, #509) reads/writes this; the orchestrator reads it host-side via
 * `resolveRoleModelForStep`. `set` normalizes any partial/garbage payload to a
 * complete ROX-defaulted mapping before persisting, so the store can never hold
 * a corrupt routing table.
 */
export const roleModelRouter = router({
	get: protectedProcedure.query(
		({ ctx }): HostRoleModelSettings => ({
			mapping: getHostRoleModelMapping(ctx.db),
		}),
	),

	set: protectedProcedure
		.input(z.object({ mapping: z.unknown() }))
		.mutation(({ ctx, input }): HostRoleModelSettings => {
			const normalized = parseRoleModelMapping(input.mapping);
			return { mapping: setHostRoleModelMapping(ctx.db, normalized) };
		}),

	resolveForStep: protectedProcedure
		.input(z.object({ stepKind: z.string() }))
		.query(
			({ ctx, input }): RoleModelSelection =>
				resolveRoleModelForStep(ctx.db, input.stepKind),
		),
});
