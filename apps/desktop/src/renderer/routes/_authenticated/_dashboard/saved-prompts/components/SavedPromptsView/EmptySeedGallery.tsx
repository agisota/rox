import { Button } from "@rox/ui/button";
import { cn } from "@rox/ui/utils";
import { LuBookmarkPlus, LuCopy, LuMessageSquarePlus } from "react-icons/lu";
import { DEFAULT_SAVED_PROMPTS, type DefaultPrompt } from "./default-prompts";

export interface EmptySeedGalleryProps {
	saving: boolean;
	onSave: (example: DefaultPrompt) => void;
	onInsert: (example: DefaultPrompt) => void;
	onCopy: (example: DefaultPrompt) => void;
}

/**
 * Empty-state seed gallery, reflowed into the new card grid. Keeps the
 * battle-tested behavior: per-card «Сохранить» materializes the example into
 * the DB, plus insert-in-chat and copy.
 */
export function EmptySeedGallery({
	saving,
	onSave,
	onInsert,
	onCopy,
}: EmptySeedGalleryProps) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex flex-col gap-1 pt-1">
				<h2 className="text-sm font-medium text-foreground">
					Примеры — сохраните себе
				</h2>
				<p className="text-sm text-muted-foreground">
					Готовые промпты для старта. Сохраните понравившиеся или создайте свой.
				</p>
			</div>
			<div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
				{DEFAULT_SAVED_PROMPTS.map((example) => (
					<div
						key={example.id}
						className={cn(
							"group flex flex-col gap-2 rounded-lg border border-dashed border-border bg-card/50 p-4",
							"transition-colors hover:border-border/80",
						)}
					>
						<div className="flex items-start justify-between gap-3">
							<h3 className="min-w-0 flex-1 truncate font-mono text-sm font-medium text-foreground">
								{example.title}
							</h3>
							<div className="flex shrink-0 items-center gap-1">
								<Button
									size="sm"
									variant="outline"
									onClick={() => onSave(example)}
									disabled={saving}
								>
									<LuBookmarkPlus className="size-4" />
									Сохранить
								</Button>
								<Button
									size="icon"
									variant="ghost"
									aria-label="Вставить в чат"
									onClick={() => onInsert(example)}
									className="size-7"
								>
									<LuMessageSquarePlus className="size-4" />
								</Button>
								<Button
									size="icon"
									variant="ghost"
									aria-label="Скопировать"
									onClick={() => onCopy(example)}
									className="size-7"
								>
									<LuCopy className="size-4" />
								</Button>
							</div>
						</div>
						<p className="line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground select-text">
							{example.body}
						</p>
					</div>
				))}
			</div>
		</div>
	);
}
