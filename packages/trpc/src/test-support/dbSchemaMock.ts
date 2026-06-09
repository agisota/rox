import { z } from "zod";

/**
 * Shared base stub for `mock.module("@rox/db/schema", …)` in router unit tests.
 *
 * Bun's `mock.module` is process-global and last-registration-wins per module
 * specifier. Several router test files mock `@rox/db/schema`, so when the suite
 * runs as one `bun test` process the *last* registered mock is the one every
 * router's static `import { … } from "@rox/db/schema"` links against. If that
 * mock omits a table another router imports (e.g. `executionCircuits`,
 * `accessGrants`), the named import fails to link with
 * "Export named '…' not found".
 *
 * Spreading this base into every schema mock guarantees the union of table
 * names is always present regardless of file order. Each test still overrides
 * the entries it asserts on; the columns here only need to exist, since the
 * mocked `@rox/db/client` never executes the queries they feed.
 */
const table = (name: string): Record<string, string> =>
	new Proxy(
		{},
		{ get: (_target, prop) => `${name}.${String(prop)}` },
	) as Record<string, string>;

export const dbSchemaMockBase = {
	members: table("members"),
	tasks: table("tasks"),
	taskStatuses: table("task_statuses"),
	v2Projects: table("v2_projects"),
	githubRepositories: table("github_repositories"),
	organizations: table("organizations"),
	subscriptions: table("subscriptions"),
	users: table("users"),
	accessGrants: table("access_grants"),
	executionCircuits: table("execution_circuits"),
	transitionRuns: table("transition_runs"),
	experienceTraceEvents: table("experience_trace_events"),
	accessResourceTypeEnum: z.enum(["project", "workspace", "host"]),
	accessGranteeTypeEnum: z.enum(["user", "team", "organization"]),
	accessRoleEnum: z.enum(["viewer", "editor", "admin"]),
};
