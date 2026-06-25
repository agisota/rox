import { Button } from "@rox/ui/button";
import { cn } from "@rox/ui/utils";
import { FileText, Trash2 } from "lucide-react";
import type { SavedDraft } from "../lib/mailStore";

export interface MailDraftsListProps {
	drafts: SavedDraft[];
	/** Open a saved draft back into the composer. */
	onOpen: (draft: SavedDraft) => void;
	/** Delete a saved draft. */
	onDelete: (id: string) => void;
}

/**
 * Panel-2 variant shown for the Черновики folder. Drafts are SERVER-BACKED
 * (FN-139 / #699): they come from `mail.listDrafts` (mapped to {@link SavedDraft})
 * so they survive reload and sync across web/desktop/mobile. Selecting one
 * re-opens it in the composer; the trash icon calls `mail.deleteDraft`.
 */
export function MailDraftsList({
	drafts,
	onOpen,
	onDelete,
}: MailDraftsListProps) {
	if (drafts.length === 0) {
		return (
			<div className="flex h-full min-h-0 flex-col items-center justify-center border-border/60 border-r bg-card/55 px-4 text-center backdrop-blur-xl">
				<FileText className="mb-3 size-7 text-muted-foreground" />
				<span className="text-foreground text-sm">Черновиков нет</span>
				<span className="mt-1 max-w-[15rem] text-muted-foreground text-xs">
					Нажмите «Сохранить черновик» в окне письма, чтобы вернуться к нему
					позже.
				</span>
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col overflow-y-auto border-border/60 border-r bg-card/55 backdrop-blur-xl">
			{drafts.map((draft) => (
				<div
					key={draft.id}
					className="group flex items-start gap-2 border-border/40 border-b px-3 py-2.5 transition-colors hover:bg-accent/40"
				>
					<button
						type="button"
						onClick={() => onOpen(draft)}
						className="flex min-w-0 flex-1 flex-col gap-0.5 text-left"
					>
						<span
							className={cn(
								"truncate font-medium text-sm",
								!draft.subject.trim() && "text-muted-foreground italic",
							)}
						>
							{draft.subject.trim() || "(без темы)"}
						</span>
						<span className="truncate text-[11px] text-muted-foreground">
							{draft.to.trim() ? `Кому: ${draft.to}` : "Получатель не указан"}
						</span>
						{draft.body.trim() && (
							<span className="truncate text-[11px] text-muted-foreground/80">
								{draft.body.replace(/\s+/g, " ").slice(0, 80)}
							</span>
						)}
					</button>
					<Button
						size="icon"
						variant="ghost"
						className="size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
						onClick={() => onDelete(draft.id)}
						aria-label="Удалить черновик"
					>
						<Trash2 className="size-3.5" />
					</Button>
				</div>
			))}
		</div>
	);
}
