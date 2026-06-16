import { Button } from "@rox/ui/button";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { Textarea } from "@rox/ui/textarea";
import { cn } from "@rox/ui/utils";
import { useEffect, useState } from "react";
import { LuFile, LuSave } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

interface SkillDetailPaneProps {
	skillId: string;
	onSaved?: () => void;
}

export function SkillDetailPane({ skillId, onSaved }: SkillDetailPaneProps) {
	const utils = electronTrpc.useUtils();
	const { data: detail, isLoading } = electronTrpc.skillsLibrary.get.useQuery({
		id: skillId,
	});

	const [activePath, setActivePath] = useState<string | null>(null);
	const [draft, setDraft] = useState("");
	const [original, setOriginal] = useState("");

	// Default the active file to SKILL.md (or the first file) once detail loads.
	useEffect(() => {
		if (!detail) return;
		const preferred =
			detail.files.find((file) => file.relativePath === "SKILL.md") ??
			detail.files[0];
		setActivePath(preferred ? preferred.relativePath : null);
	}, [detail]);

	const { data: fileData, isFetching: isFileLoading } =
		electronTrpc.skillsLibrary.readFile.useQuery(
			{ id: skillId, relativePath: activePath ?? "" },
			{ enabled: activePath !== null },
		);

	useEffect(() => {
		if (fileData) {
			setDraft(fileData.content);
			setOriginal(fileData.content);
		}
	}, [fileData]);

	const writeMutation = electronTrpc.skillsLibrary.writeFile.useMutation({
		onSuccess: () => {
			setOriginal(draft);
			void utils.skillsLibrary.get.invalidate({ id: skillId });
			if (activePath) {
				void utils.skillsLibrary.readFile.invalidate({
					id: skillId,
					relativePath: activePath,
				});
			}
			onSaved?.();
		},
		onError: (error) => toast.error(`Не удалось сохранить: ${error.message}`),
	});

	const isDirty = draft !== original;

	if (isLoading || !detail) {
		return (
			<div className="flex flex-col gap-3 p-6">
				<Skeleton className="h-7 w-64" />
				<Skeleton className="h-4 w-full max-w-md" />
				<Skeleton className="mt-4 h-64 w-full" />
			</div>
		);
	}

	return (
		<div className="flex h-full min-h-0 flex-col">
			<header className="border-b border-border px-6 py-4">
				<h2 className="text-base font-semibold text-foreground">
					{detail.name}
				</h2>
				{detail.description && (
					<p className="mt-0.5 text-sm text-muted-foreground select-text">
						{detail.description}
					</p>
				)}
				<p className="mt-1 truncate font-mono text-xs text-muted-foreground/70 select-text">
					{detail.absolutePath}
				</p>
			</header>

			<div className="flex min-h-0 flex-1">
				<div className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border p-2">
					{detail.files.length === 0 ? (
						<p className="px-2 py-4 text-xs text-muted-foreground">
							Файлы не найдены.
						</p>
					) : (
						detail.files.map((file) => (
							<button
								key={file.relativePath}
								type="button"
								onClick={() => setActivePath(file.relativePath)}
								className={cn(
									"flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
									file.relativePath === activePath
										? "bg-accent text-foreground"
										: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
								)}
							>
								<LuFile className="size-3.5 shrink-0" />
								<span className="min-w-0 flex-1 truncate font-mono">
									{file.relativePath}
								</span>
							</button>
						))
					)}
				</div>

				<div className="flex min-w-0 flex-1 flex-col">
					<div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
						<span className="min-w-0 truncate font-mono text-xs text-muted-foreground">
							{activePath ?? "Файл не выбран"}
						</span>
						<Button
							size="sm"
							disabled={!isDirty || !activePath || writeMutation.isPending}
							onClick={() => {
								if (!activePath) return;
								writeMutation.mutate({
									id: skillId,
									relativePath: activePath,
									content: draft,
								});
							}}
						>
							<LuSave className="size-4" />
							Сохранить
						</Button>
					</div>
					{activePath === null ? (
						<div className="flex flex-1 items-center justify-center p-6 text-sm text-muted-foreground">
							Выберите файл слева, чтобы посмотреть или отредактировать его.
						</div>
					) : isFileLoading && draft.length === 0 ? (
						<div className="flex flex-col gap-2 p-4">
							<Skeleton className="h-4 w-full" />
							<Skeleton className="h-4 w-5/6" />
							<Skeleton className="h-4 w-2/3" />
						</div>
					) : (
						<Textarea
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
							spellCheck={false}
							className="m-0 min-h-0 flex-1 resize-none rounded-none border-0 font-mono text-xs leading-relaxed focus-visible:ring-0"
						/>
					)}
				</div>
			</div>
		</div>
	);
}
