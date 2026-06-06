import {
	type JsonSchema,
	type SupersetWorkflowState,
	validateGraph,
	type WorkflowIssue,
} from "@superset/workflow-core";
import { TRPCError } from "@trpc/server";

/** The four mutually-exclusive ways a skill version can be implemented. */
export interface SkillImplementationRefs {
	workflowDeploymentId?: string | null;
	legacyAutomationId?: string | null;
	simWorkflowExternalId?: string | null;
	externalToolRef?: unknown;
}

/** Count how many implementation refs are set on a skill version. */
export function countImplementationRefs(refs: SkillImplementationRefs): number {
	let n = 0;
	if (refs.workflowDeploymentId) n++;
	if (refs.legacyAutomationId) n++;
	if (refs.simWorkflowExternalId) n++;
	if (refs.externalToolRef != null) n++;
	return n;
}

/**
 * A skill version must point at EXACTLY one implementation (DB-06 / SKILL spec).
 * Throws BAD_REQUEST otherwise.
 */
export function assertExactlyOneImplementationRef(
	refs: SkillImplementationRefs,
): void {
	const n = countImplementationRefs(refs);
	if (n !== 1) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `A skill version must have exactly one implementation reference; got ${n}.`,
		});
	}
}

export interface PublishValidationResult {
	ok: boolean;
	issues: WorkflowIssue[];
	reason?: string;
}

/**
 * Validate that a workflow draft can be published as an executable skill
 * (SKILL-02 / SKILL-03): the graph must validate and both input + output
 * schemas must be present.
 */
export function validatePublishInput(
	state: SupersetWorkflowState,
	inputSchema: JsonSchema | undefined,
	outputSchema: JsonSchema | undefined,
): PublishValidationResult {
	const graph = validateGraph(state);
	if (!graph.valid) {
		return {
			ok: false,
			issues: graph.issues,
			reason: "Workflow graph is invalid.",
		};
	}
	if (!inputSchema) {
		return { ok: false, issues: [], reason: "Missing input schema." };
	}
	if (!outputSchema) {
		return { ok: false, issues: [], reason: "Missing output schema." };
	}
	return { ok: true, issues: [] };
}

/** Throw BAD_REQUEST with the validation issues when a draft can't be published. */
export function assertPublishable(result: PublishValidationResult): void {
	if (!result.ok) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: result.reason ?? "Workflow is not publishable.",
			cause: result.issues,
		});
	}
}

/** Run-mode enforcement (SKILL-07): a skill only runs via its allowed modes. */
export function isRunModeAllowed(
	runModes: readonly string[],
	requested: string,
): boolean {
	return runModes.includes(requested);
}

export function assertRunModeAllowed(
	runModes: readonly string[],
	requested: string,
): void {
	if (!isRunModeAllowed(runModes, requested)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: `Skill cannot be run via "${requested}". Allowed modes: ${runModes.join(", ") || "(none)"}.`,
		});
	}
}

export interface BindingLike {
	surface: string;
	objectType?: string | null;
	enabled: boolean;
}

/**
 * Binding-surface filtering (SKILL-05 / SKILL-06): a binding matches a surface
 * query only when enabled, on the same surface, and — for object actions — on
 * the requested object type (a null binding objectType matches any).
 */
export function bindingMatchesSurface(
	binding: BindingLike,
	surface: string,
	objectType?: string | null,
): boolean {
	if (!binding.enabled) return false;
	if (binding.surface !== surface) return false;
	if (objectType != null && binding.objectType != null) {
		return binding.objectType === objectType;
	}
	return true;
}

/**
 * A skill is exposed on a surface only when it has an enabled binding for it.
 * This is the gate behind API/MCP/agent exposure (MCP-02, API-02, E2E-04): no
 * binding => not exposed, full stop.
 */
export function isSkillExposedVia(
	bindings: BindingLike[],
	surface: string,
	objectType?: string | null,
): boolean {
	return bindings.some((b) => bindingMatchesSurface(b, surface, objectType));
}

/** Throw FORBIDDEN unless the skill is exposed on the requested surface. */
export function assertExposedVia(
	bindings: BindingLike[],
	surface: string,
	objectType?: string | null,
): void {
	if (!isSkillExposedVia(bindings, surface, objectType)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: `Skill is not exposed via "${surface}".`,
		});
	}
}
