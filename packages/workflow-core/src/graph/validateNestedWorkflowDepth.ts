import { WorkflowErrorCode, type WorkflowIssue } from "../errors";

/** Default maximum nesting depth for skill-call / child-workflow chains. */
export const DEFAULT_MAX_NESTED_DEPTH = 5;

/**
 * Validate that a chain of nested skill/workflow calls does not exceed
 * `maxDepth`. `getChildren(id)` returns the skill ids that the given skill
 * invokes. Returns a `NESTED_WORKFLOW_DEPTH_EXCEEDED` issue when the limit is
 * crossed. A visiting-set guards against infinite recursion on dependency
 * cycles.
 */
export function validateNestedWorkflowDepth(
	rootId: string,
	getChildren: (id: string) => string[],
	maxDepth: number = DEFAULT_MAX_NESTED_DEPTH,
): WorkflowIssue[] {
	const issues: WorkflowIssue[] = [];
	const visiting = new Set<string>();
	let reported = false;

	const walk = (id: string, depth: number): void => {
		if (reported) return;
		if (depth > maxDepth) {
			issues.push({
				code: WorkflowErrorCode.NESTED_WORKFLOW_DEPTH_EXCEEDED,
				severity: "error",
				blockId: id,
				message: `Nested workflow depth ${depth} exceeds the maximum of ${maxDepth}`,
			});
			reported = true;
			return;
		}
		if (visiting.has(id)) return;
		visiting.add(id);
		for (const child of getChildren(id)) walk(child, depth + 1);
		visiting.delete(id);
	};

	walk(rootId, 0);
	return issues;
}
