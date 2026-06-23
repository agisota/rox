import Link from "next/link";
import { AgentsHeader } from "../../components/AgentsHeader";
import { type AgentsHostListing, loadAgentsHostTargets } from "../data";
import {
	resolveWorkspacesListView,
	type WorkspacesListItem,
} from "./resolveWorkspacesListView";

/**
 * Workspaces/hosts index for the agents cabinet (WS-B T3/T6).
 *
 * Real-data listing: reads the org's attached hosts via `host.list`
 * ({@link loadAgentsHostTargets}) and maps them through the pure
 * {@link resolveWorkspacesListView} presenter, replacing the former
 * `mockWorkspaces` prototype. Each row links into the existing
 * `/agents/workspace/[id]` detail with the host id as the `?host=` routing
 * hint, so the live read plane (D6 plane A) can attach. Loading is handled by
 * the server render itself; empty + error states are rendered inline so a
 * fresh org (no hosts) or a degraded backend never 404s or 500s the route.
 */
export default async function AgentsWorkspacesPage() {
	let listing: AgentsHostListing | null = null;
	try {
		listing = await loadAgentsHostTargets();
	} catch {
		// A degraded backend (relay/db hiccup) must not crash the cabinet — show a
		// recoverable error state instead of bubbling to the route error boundary.
		listing = null;
	}

	const view = listing ? resolveWorkspacesListView(listing) : null;

	return (
		<>
			<AgentsHeader />
			<main className="mx-auto w-full max-w-screen-lg px-4 py-8">
				<h1 className="mb-6 text-2xl font-medium">Рабочие области</h1>
				{view === null ? (
					<ErrorState />
				) : view.isEmpty ? (
					<EmptyState />
				) : (
					<WorkspacesList items={view.items} />
				)}
			</main>
		</>
	);
}

function WorkspacesList({ items }: { items: WorkspacesListItem[] }) {
	return (
		<ul className="flex flex-col gap-2">
			{items.map((item) => (
				<li key={item.hostId}>
					<Link
						href={item.href}
						className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-secondary/30 px-4 py-3 transition-colors hover:bg-secondary/60"
					>
						<span className="flex flex-col gap-1">
							<span className="text-sm font-medium">{item.name}</span>
							<span className="text-xs text-muted-foreground">
								{item.kindLabel}
							</span>
						</span>
						<span className="flex items-center gap-2 text-xs text-muted-foreground">
							<span
								aria-hidden
								className={
									item.online
										? "size-2 rounded-full bg-emerald-500"
										: "size-2 rounded-full bg-muted-foreground/40"
								}
							/>
							{item.statusLabel}
						</span>
					</Link>
				</li>
			))}
		</ul>
	);
}

function EmptyState() {
	return (
		<p className="rounded-md border border-border/60 bg-secondary/20 px-4 py-6 text-sm text-muted-foreground">
			Пока нет подключённых хостов. Запустите Rox на устройстве или создайте
			удалённый хост, чтобы он появился здесь.
		</p>
	);
}

function ErrorState() {
	return (
		<p className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-6 text-sm text-muted-foreground">
			Не удалось загрузить список хостов. Обновите страницу — если ошибка
			повторяется, попробуйте позже.
		</p>
	);
}
