import Link from "next/link";
import { AgentsHeader } from "../../components/AgentsHeader";
import { mockWorkspaces } from "../../mock-data";

/**
 * Workspaces index for the agents cabinet (WS-B T6).
 *
 * Added so the new "Рабочие области" nav entry resolves to a real route — half
 * of the 404 fix was that flag-ON users had no way to reach a workspaces list.
 * It lists workspaces (mock today, like the rest of the cabinet) and links into
 * the existing `/agents/workspace/[id]` detail. WS-B P1 (T3) replaces the mock
 * source with `host.list` + `v2Workspace.getFromHost`.
 */
export default function AgentsWorkspacesPage() {
	return (
		<>
			<AgentsHeader />
			<main className="mx-auto w-full max-w-screen-lg px-4 py-8">
				<h1 className="mb-6 text-2xl font-medium">Рабочие области</h1>
				<ul className="flex flex-col gap-2">
					{mockWorkspaces.map((workspace) => (
						<li key={workspace.id}>
							<Link
								href={`/agents/workspace/${workspace.id}`}
								className="flex flex-col gap-1 rounded-md border border-border/60 bg-secondary/30 px-4 py-3 transition-colors hover:bg-secondary/60"
							>
								<span className="text-sm font-medium">{workspace.name}</span>
								<span className="text-xs text-muted-foreground">
									{workspace.repoFullName} · {workspace.branch}
								</span>
							</Link>
						</li>
					))}
				</ul>
			</main>
		</>
	);
}
