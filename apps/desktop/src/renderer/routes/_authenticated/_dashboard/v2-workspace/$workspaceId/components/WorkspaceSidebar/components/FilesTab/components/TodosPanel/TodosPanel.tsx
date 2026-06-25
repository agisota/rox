import { ListTodo } from "lucide-react";

/**
 * Todos tab body (F30). Agent-run todos are surfaced inline in the chat plan
 * stream rather than persisted as project data, so the standalone panel shows
 * an honest empty state instead of fabricating rows. The tablist still renders
 * the tab so the three-tab contract (Files / Artifacts / Todos) is complete.
 */
export function TodosPanel() {
	return (
		<div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center text-sm text-muted-foreground">
			<ListTodo className="size-5 opacity-60" />
			<span>Задач пока нет</span>
		</div>
	);
}
