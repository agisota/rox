"use client";

import { Button } from "@rox/ui/button";
import { cn } from "@rox/ui/utils";
import { useQuery } from "@tanstack/react-query";
import { Notebook, Plus } from "lucide-react";
import { useTRPC } from "@/trpc/react";
import { useNotesActions } from "../../hooks/useNotesActions";

export interface NotebookSidebarProps {
	selectedNotebookId: string | null;
	onSelect: (notebookId: string) => void;
}

/**
 * Notebook list rail. Cache-first: renders the last-known notebooks immediately;
 * the skeleton/empty states only apply when there is genuinely no data yet.
 */
export function NotebookSidebar({
	selectedNotebookId,
	onSelect,
}: NotebookSidebarProps) {
	const trpc = useTRPC();
	const notebooks = useQuery(trpc.notebooks.listNotebooks.queryOptions());
	const actions = useNotesActions(selectedNotebookId);

	const handleCreate = () => {
		const name = window.prompt("Название блокнота");
		if (!name?.trim()) return;
		actions.createNotebook.mutate(
			{ name: name.trim() },
			{ onSuccess: (row) => row?.id && onSelect(row.id) },
		);
	};

	const data = notebooks.data ?? [];

	return (
		<aside className="flex w-56 shrink-0 flex-col gap-2 border-r pr-3">
			<div className="flex items-center justify-between px-1">
				<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
					Блокноты
				</span>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="size-7"
					aria-label="Новый блокнот"
					onClick={handleCreate}
				>
					<Plus className="size-4" />
				</Button>
			</div>

			<nav className="flex flex-col gap-0.5">
				{data.map((notebook) => (
					<button
						key={notebook.id}
						type="button"
						onClick={() => onSelect(notebook.id)}
						className={cn(
							"flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
							selectedNotebookId === notebook.id && "bg-muted font-medium",
						)}
					>
						<span className="text-muted-foreground">
							{notebook.icon ?? <Notebook className="size-4" />}
						</span>
						<span className="truncate">{notebook.name}</span>
					</button>
				))}
				{data.length === 0 ? (
					<p className="px-2 py-3 text-muted-foreground text-xs">
						Пока нет блокнотов. Создайте первый.
					</p>
				) : null}
			</nav>
		</aside>
	);
}
