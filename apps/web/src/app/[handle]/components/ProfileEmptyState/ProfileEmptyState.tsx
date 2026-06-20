/**
 * Shared empty-state card for profile sections that have no public data model
 * wired yet (agents/subagents/hooks/drive/feed/projects/stats) or whose public
 * collection is currently empty. Keeps the public profile honest: a clear
 * "Пока пусто" instead of a fake "скоро появится" stub.
 */
export function ProfileEmptyState({
	title,
	message = "Пока пусто",
}: {
	title: string;
	message?: string;
}) {
	return (
		<section className="rounded-xl border bg-card p-6">
			<h2 className="text-lg font-medium">{title}</h2>
			<p className="mt-2 text-sm text-muted-foreground">{message}</p>
		</section>
	);
}
