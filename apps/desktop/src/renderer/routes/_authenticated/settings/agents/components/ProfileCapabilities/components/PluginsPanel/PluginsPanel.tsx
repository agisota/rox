/**
 * Plugins panel (F47, #644) — read-only.
 *
 * Per-persona plugin assignment is intentionally out of scope for F47 (the
 * scope marks Plugins as read-only). This renders the explanatory empty state so
 * the tab is present and honest about its capability, without faking an
 * assignment surface.
 */
export function PluginsPanel() {
	return (
		<div className="space-y-3 pt-3">
			<h3 className="font-medium text-sm">Плагины</h3>
			<p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
				Плагины доступны только для просмотра. Назначение плагинов на персону
				появится позже.
			</p>
		</div>
	);
}
