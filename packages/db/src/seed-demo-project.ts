import { and, eq } from "drizzle-orm";
import { dbWs } from "./client";
import type { InsertProject, InsertV2Project } from "./schema";
import { projects, v2Projects } from "./schema";

type DbWsTransaction = Parameters<Parameters<typeof dbWs.transaction>[0]>[0];
type Executor = typeof dbWs | DbWsTransaction;

/**
 * Demo project display color (Tailwind yellow-400), per issue #26.
 *
 * NOTE: neither the V1 `projects` nor the V2 `v2_projects` cloud table carries
 * a `color` column — project accent color is renderer-local state. This is
 * exported so the renderer can apply it when it first surfaces the demo
 * project (see the deferred renderer follow-up in the PR for #26).
 */
export const DEMO_PROJECT_COLOR = "#facc15";

/**
 * Bundled demo-project icon asset name (yellow pizza-slice glyph), per issue
 * #26. Shipped as a repo asset at `apps/desktop/resources/icons/pizdariki.svg`.
 *
 * NOTE: `v2_projects.icon_url` is consumed by the renderer as a plain
 * `<img src>` (ProjectThumbnail) and must therefore be a resolvable URL. A
 * bundled relative asset path is NOT a valid `<img src>` in the renderer, so we
 * intentionally leave `v2_projects.icon_url` null on seed (graceful first-letter
 * fallback) and surface the bundled icon name here for the renderer follow-up to
 * resolve via the app-resource protocol.
 */
export const DEMO_PROJECT_ICON_ASSET = "icons/pizdariki.svg";

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
 * The same demo project expressed for the V2 `v2_projects` table — the table
 * the live desktop projects list / dashboard sidebar actually reads (via
 * Electric sync; see
 * apps/desktop/.../CollectionsProvider/collections.ts `v2_projects` shape and
 * useDashboardSidebarData's `collections.v2Projects` join). Shares the demo
 * slug so the `(organizationId, slug)` unique constraint makes the V2 seed
 * idempotent, exactly like the V1 seed.
 *
 * `iconUrl` is intentionally omitted (null): the renderer renders it as a plain
 * `<img src>` and a bundled relative path would 404. The pizdariki icon +
 * yellow color are surfaced as constants for the renderer follow-up.
 */
const DEMO_V2_PROJECT: Pick<InsertV2Project, "name" | "slug"> = {
	name: DEMO_PROJECT.name,
	slug: DEMO_PROJECT.slug,
};

/**
 * Idempotently ensure the demo row exists in the legacy V1 `projects` table.
 * Kept for backward compatibility: V1 project rows back the sandbox-image /
 * host-service repo-metadata paths even though the live desktop projects list
 * reads V2 (see `seedDemoV2Project`).
 *
 * Returns the id of the existing or newly-created V1 demo project.
 */
async function seedDemoV1Project(
	organizationId: string,
	executor: Executor,
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

/**
 * Idempotently ensure the demo row exists in the V2 `v2_projects` table — the
 * table the live desktop projects list / dashboard sidebar reads. This is the
 * row that makes the demo project VISIBLE in the running desktop app for a
 * brand-new org. Same `(organizationId, slug)` idempotency + concurrent-insert
 * race fallback as the V1 seed.
 *
 * Returns the id of the existing or newly-created V2 demo project.
 */
async function seedDemoV2Project(
	organizationId: string,
	executor: Executor,
): Promise<string> {
	const [existing] = await executor
		.select({ id: v2Projects.id })
		.from(v2Projects)
		.where(
			and(
				eq(v2Projects.organizationId, organizationId),
				eq(v2Projects.slug, DEMO_V2_PROJECT.slug),
			),
		)
		.limit(1);

	if (existing) return existing.id;

	const [created] = await executor
		.insert(v2Projects)
		.values({ ...DEMO_V2_PROJECT, organizationId })
		.onConflictDoNothing({
			target: [v2Projects.organizationId, v2Projects.slug],
		})
		.returning({ id: v2Projects.id });

	if (created) return created.id;

	const [raced] = await executor
		.select({ id: v2Projects.id })
		.from(v2Projects)
		.where(
			and(
				eq(v2Projects.organizationId, organizationId),
				eq(v2Projects.slug, DEMO_V2_PROJECT.slug),
			),
		)
		.limit(1);

	if (!raced) throw new Error("Failed to seed demo v2 project");
	return raced.id;
}

/**
 * Seed a demo project for an organization so a freshly-onboarded user lands in
 * a usable workspace instead of an empty project list (issue #26).
 *
 * Writes BOTH project surfaces, idempotently:
 *   - V1 `projects`     — legacy repo-metadata surface (sandbox images, etc.)
 *   - V2 `v2_projects`  — the table the LIVE desktop projects list / dashboard
 *                         sidebar actually reads (Electric sync). This is the
 *                         row that makes the demo project visible in the app.
 *
 * Idempotent: a second call (or a re-run of onboarding) is a no-op for each
 * surface thanks to the per-table `(organizationId, slug)` unique constraint
 * plus a concurrent-insert race fallback. When called with the default
 * executor the two seeds run in a single transaction so the org never ends up
 * with one surface populated and the other empty.
 *
 * Returns the id of the V2 demo project (the visible surface). Pass a
 * transaction (`tx`) to enlist in an existing transaction.
 */
export async function seedDemoProject(
	organizationId: string,
	executor?: Executor,
): Promise<string> {
	if (executor) {
		// Caller owns the transaction boundary; seed both surfaces on it.
		await seedDemoV1Project(organizationId, executor);
		return seedDemoV2Project(organizationId, executor);
	}

	// Own the transaction so V1 + V2 are seeded atomically.
	return dbWs.transaction(async (tx) => {
		await seedDemoV1Project(organizationId, tx);
		return seedDemoV2Project(organizationId, tx);
	});
}
