import type { EntitySyncState } from "../../../../db/schema";
import { projects } from "../../../../db/schema";
import type { HostServiceContext } from "../../../../types";
import type { ResolvedRepo } from "./resolve-repo";

export function persistLocalProject(
	ctx: Pick<HostServiceContext, "db">,
	projectId: string,
	resolved: ResolvedRepo,
	// Local-first create passes `syncState: 'pending'`. Omitted by the
	// synchronous-cloud path, which lets the column default (`synced`) apply —
	// that path only ever inserts a project row alongside its cloud row.
	options?: { syncState?: EntitySyncState },
): void {
	const repoFields = {
		repoPath: resolved.repoPath,
		repoProvider: resolved.parsed ? ("github" as const) : null,
		repoOwner: resolved.parsed?.owner ?? null,
		repoName: resolved.parsed?.name ?? null,
		repoUrl: resolved.parsed?.url ?? null,
		remoteName: resolved.remoteName,
		...(options?.syncState ? { syncState: options.syncState } : {}),
	};
	ctx.db
		.insert(projects)
		.values({ id: projectId, ...repoFields })
		.onConflictDoUpdate({ target: projects.id, set: repoFields })
		.run();
}
