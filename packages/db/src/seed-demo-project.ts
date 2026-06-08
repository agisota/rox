import { and, eq } from "drizzle-orm";
import { dbWs } from "./client";
import type { InsertProject } from "./schema";
import { projects } from "./schema";

type DbWsTransaction = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];
type Executor = typeof dbWs | DbWsTransaction;

/**
 * The demo project seeded into every new organization so a freshly-onboarded
 * user lands in a usable workspace instead of an empty / "no organization
 * selected" state. Keyed by `slug` (unique per organization) for idempotency.
 */
const DEMO_PROJECT: Pick<
	InsertProject,
	"name" | "slug" | "repoOwner" | "repoName" | "repoUrl" | "defaultBranch"
> = {
	name: "Demo Project",
	slug: "demo-project",
	repoOwner: "rox-one",
	repoName: "demo",
	repoUrl: "https://github.com/rox-one/demo",
	defaultBranch: "main",
};

/**
 * Seed a demo project for an organization. Idempotent: a second call (or a
 * re-run of onboarding) is a no-op thanks to the `(organizationId, slug)`
 * unique constraint. Pass a transaction (`tx`) to run within an existing
 * transaction, otherwise wraps in its own via `dbWs`.
 *
 * Returns the id of the existing or newly-created demo project.
 */
export async function seedDemoProject(
	organizationId: string,
	executor: Executor = dbWs,
): Promise<string> {
	const [existing] = await executor
		.select({ id: projects.id })
		.from(projects)
		.where(
			and(
				eq(projects.organizationId, organizationId),
				eq(projects.slug, DEMO_PROJECT.slug),
			),
		)
		.limit(1);

	if (existing) return existing.id;

	const [created] = await executor
		.insert(projects)
		.values({ ...DEMO_PROJECT, organizationId })
		.onConflictDoNothing({
			target: [projects.organizationId, projects.slug],
		})
		.returning({ id: projects.id });

	// `onConflictDoNothing` returns nothing on a concurrent insert race — fall
	// back to reading the row that the other writer committed.
	if (created) return created.id;

	const [raced] = await executor
		.select({ id: projects.id })
		.from(projects)
		.where(
			and(
				eq(projects.organizationId, organizationId),
				eq(projects.slug, DEMO_PROJECT.slug),
			),
		)
		.limit(1);

	if (!raced) throw new Error("Failed to seed demo project");
	return raced.id;
}
