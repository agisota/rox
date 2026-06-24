import { Button } from "@rox/ui/button";
import { PopIn } from "@rox/ui/motion";
import { FolderPlus, UploadCloud } from "lucide-react";

interface DriveEmptyStateProps {
	/** Root has no parent — copy differs slightly from an empty subfolder. */
	isRoot: boolean;
	onUpload: () => void;
	onCreateFolder: () => void;
}

/**
 * Centered glass empty card. Root: «Здесь пока пусто» + drag/upload prompt with
 * a primary upload CTA. Subfolder: «Папка пуста» + create-subfolder hint. An
 * upgrade on the old stub's bare «Папка пуста» line.
 */
export function DriveEmptyState({
	isRoot,
	onUpload,
	onCreateFolder,
}: DriveEmptyStateProps) {
	return (
		<div className="flex flex-1 items-center justify-center p-6">
			<div className="glass-panel flex max-w-sm flex-col items-center rounded-2xl border border-border/60 border-dashed px-8 py-12 text-center">
				<PopIn active>
					<UploadCloud className="mb-4 size-10 text-primary" />
				</PopIn>
				<p className="font-medium text-foreground text-sm">
					{isRoot ? "Здесь пока пусто" : "Папка пуста"}
				</p>
				<p className="mt-1 max-w-xs text-muted-foreground text-xs">
					{isRoot
						? "Перетащите файлы сюда или нажмите «Загрузить»."
						: "Перетащите файлы или создайте подпапку."}
				</p>
				<div className="mt-5 flex items-center gap-2">
					<Button type="button" onClick={onUpload}>
						<UploadCloud className="size-4" /> Загрузить
					</Button>
					<Button type="button" variant="outline" onClick={onCreateFolder}>
						<FolderPlus className="size-4" /> Папка
					</Button>
				</div>
			</div>
		</div>
	);
}
