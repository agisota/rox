import Link from "next/link";

/**
 * Uniform "no access" view for the entire `(agents)` route group (WS-B T6).
 *
 * Replaces the old mixed gate where index pages always rendered and only the
 * Workspace detail hard-`redirect("/")`d — the inconsistency users perceived
 * as a 404. Now a single layout-level decision renders THIS view whenever the
 * agents-UI flag is off, so every `(agents)` route behaves the same.
 *
 * `degraded` means the access check itself could not run (PostHog outage). The
 * gate now FAILS OPEN on outage (`resolveAgentsUiAccess`), so this degraded copy
 * is only reached on the defensive path where access is still denied while the
 * check is degraded; it explains the unavailable check rather than implying a
 * genuine deny.
 */
export function AgentsAccessGate({ degraded }: { degraded: boolean }) {
	return (
		<div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 text-center">
			<div className="flex max-w-md flex-col items-center gap-4">
				<h1 className="text-2xl font-medium">Агенты Rox</h1>
				{degraded ? (
					<p className="text-sm text-muted-foreground">
						Не удалось проверить доступ к интерфейсу агентов. Обновите страницу
						позже — если это повторяется, напишите в поддержку.
					</p>
				) : (
					<p className="text-sm text-muted-foreground">
						Интерфейс агентов пока в раннем доступе. Запросите доступ, и мы
						откроем его для вашего аккаунта.
					</p>
				)}
				<Link
					href="/"
					className="rounded-md border border-border/60 bg-secondary/50 px-4 py-2 text-sm font-medium transition-colors hover:bg-secondary"
				>
					Вернуться на главную
				</Link>
			</div>
		</div>
	);
}
