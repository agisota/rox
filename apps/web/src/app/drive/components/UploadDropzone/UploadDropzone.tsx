"use client";

import { cn } from "@rox/ui/utils";
import { CheckCircle2, Loader2, Upload, XCircle } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useDriveUpload } from "../../hooks/useDriveUpload";

interface UploadDropzoneProps {
	folderId: string | null;
}

/**
 * Drag-or-click upload surface. Uses the presigned flow via `useDriveUpload`:
 * the browser hashes each file, asks the API to sign a PUT, sends bytes directly
 * to the bucket, then confirms. Shows per-file progress + dedup hits.
 */
export function UploadDropzone({ folderId }: UploadDropzoneProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [isDragging, setIsDragging] = useState(false);
	const { items, uploadFiles, clearCompleted, isUploading } =
		useDriveUpload(folderId);

	const handleFiles = useCallback(
		(fileList: FileList | null) => {
			if (!fileList || fileList.length === 0) return;
			void uploadFiles(Array.from(fileList));
		},
		[uploadFiles],
	);

	const onDrop = useCallback(
		(event: React.DragEvent<HTMLButtonElement>) => {
			event.preventDefault();
			setIsDragging(false);
			handleFiles(event.dataTransfer.files);
		},
		[handleFiles],
	);

	return (
		<div className="space-y-3">
			<button
				type="button"
				onClick={() => inputRef.current?.click()}
				onDragOver={(event) => {
					event.preventDefault();
					setIsDragging(true);
				}}
				onDragLeave={() => setIsDragging(false)}
				onDrop={onDrop}
				className={cn(
					"flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors",
					isDragging
						? "border-primary bg-primary/5"
						: "border-border hover:border-primary/50 hover:bg-accent/40",
				)}
				aria-label="Загрузить файлы"
			>
				<Upload className="size-6 text-muted-foreground" />
				<span className="font-medium text-foreground text-sm">
					Перетащите файлы сюда или нажмите, чтобы выбрать
				</span>
				<span className="text-muted-foreground text-xs">
					Файлы загружаются напрямую в хранилище
				</span>
			</button>

			<input
				ref={inputRef}
				type="file"
				multiple
				className="hidden"
				onChange={(event) => {
					handleFiles(event.target.files);
					event.target.value = "";
				}}
			/>

			{items.length > 0 ? (
				<ul className="space-y-1 rounded-lg border p-2">
					{items.map((item) => (
						<li
							key={item.id}
							className="flex items-center gap-2 px-1 py-1 text-sm"
						>
							{item.status === "uploading" ? (
								<Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
							) : item.status === "done" ? (
								<CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
							) : (
								<XCircle className="size-4 shrink-0 text-destructive" />
							)}
							<span className="min-w-0 flex-1 truncate">{item.name}</span>
							{item.status === "done" && item.dedup ? (
								<span className="text-muted-foreground text-xs">
									уже в хранилище
								</span>
							) : null}
							{item.status === "error" ? (
								<span className="truncate text-destructive text-xs">
									{item.error}
								</span>
							) : null}
						</li>
					))}
					{!isUploading ? (
						<li className="px-1 pt-1">
							<button
								type="button"
								onClick={clearCompleted}
								className="text-muted-foreground text-xs underline-offset-4 hover:underline"
							>
								Очистить
							</button>
						</li>
					) : null}
				</ul>
			) : null}
		</div>
	);
}
