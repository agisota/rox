import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { Input } from "@rox/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { toast } from "@rox/ui/sonner";
import { Textarea } from "@rox/ui/textarea";
import { cn } from "@rox/ui/utils";
import { useEffect, useMemo, useState } from "react";
import { LuStar, LuVariable, LuX } from "react-icons/lu";
import { normalizeTags } from "../../lib/prompt-metadata";
import type { PromptEntry } from "../../lib/types";
import { parseVariableNames } from "../../lib/variables";

export type EditorState =
	| { mode: "closed" }
	| { mode: "create"; seed?: PromptDraft }
	| { mode: "edit"; prompt: PromptEntry };

export interface PromptDraft {
	title: string;
	body: string;
	folder: string | null;
	tags: string[];
	favorite: boolean;
}

export interface PromptEditorSubmit extends PromptDraft {
	id?: string;
}

export interface PromptEditorDialogProps {
	state: EditorState;
	saving: boolean;
	/** Existing folder names to offer in the folder picker. */
	availableFolders: string[];
	onClose: () => void;
	onSubmit: (submit: PromptEditorSubmit) => void;
}

const NO_FOLDER = "__none__";
const NEW_FOLDER = "__new__";

function draftFromState(state: EditorState): PromptDraft {
	if (state.mode === "edit") {
		return {
			title: state.prompt.title,
			body: state.prompt.body,
			folder: state.prompt.folder,
			tags: state.prompt.tags,
			favorite: state.prompt.favorite,
		};
	}
	if (state.mode === "create" && state.seed) {
		return state.seed;
	}
	return { title: "", body: "", folder: null, tags: [], favorite: false };
}

/**
 * Create/edit dialog: mono body editor, folder picker (existing or new),
 * tag combobox (chip add/remove), favorite toggle, and a live «Обнаруженные
 * переменные» readout parsed from the body so the user sees what fields a
 * consumer will be asked to fill.
 */
export function PromptEditorDialog({
	state,
	saving,
	availableFolders,
	onClose,
	onSubmit,
}: PromptEditorDialogProps) {
	const isOpen = state.mode !== "closed";

	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [folder, setFolder] = useState<string | null>(null);
	const [creatingFolder, setCreatingFolder] = useState(false);
	const [newFolder, setNewFolder] = useState("");
	const [tags, setTags] = useState<string[]>([]);
	const [favorite, setFavorite] = useState(false);
	const [tagInput, setTagInput] = useState("");

	// Re-seed the form each time the dialog opens for a new target.
	useEffect(() => {
		if (!isOpen) return;
		const draft = draftFromState(state);
		setTitle(draft.title);
		setBody(draft.body);
		setFolder(draft.folder);
		setCreatingFolder(false);
		setNewFolder("");
		setTags(draft.tags);
		setFavorite(draft.favorite);
		setTagInput("");
	}, [isOpen, state]);

	const detectedVariables = useMemo(() => parseVariableNames(body), [body]);

	const folderOptions = useMemo(() => {
		const set = new Set(availableFolders);
		if (folder) set.add(folder);
		return Array.from(set).sort((a, b) =>
			a.localeCompare(b, "ru", { sensitivity: "base" }),
		);
	}, [availableFolders, folder]);

	const selectValue = creatingFolder
		? NEW_FOLDER
		: folder === null
			? NO_FOLDER
			: folder;

	const handleFolderSelect = (value: string) => {
		if (value === NEW_FOLDER) {
			setCreatingFolder(true);
			setFolder(null);
			return;
		}
		setCreatingFolder(false);
		setNewFolder("");
		setFolder(value === NO_FOLDER ? null : value);
	};

	const commitTagInput = () => {
		const next = normalizeTags([...tags, tagInput]);
		setTags(next);
		setTagInput("");
	};

	const removeTag = (tag: string) =>
		setTags((prev) => prev.filter((existing) => existing !== tag));

	const handleSubmit = () => {
		const trimmedTitle = title.trim();
		if (trimmedTitle.length === 0 || body.trim().length === 0) {
			toast.error("Заполните название и текст промпта");
			return;
		}
		const resolvedFolder = creatingFolder
			? newFolder.trim().length > 0
				? newFolder.trim()
				: null
			: folder;
		onSubmit({
			id: state.mode === "edit" ? state.prompt.id : undefined,
			title: trimmedTitle,
			body,
			folder: resolvedFolder,
			tags,
			favorite,
		});
	};

	return (
		<Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>
						{state.mode === "edit" ? "Редактировать промпт" : "Новый промпт"}
					</DialogTitle>
					<DialogDescription>
						Используйте {"{{переменная}}"} в тексте — их можно будет заполнить
						при вставке.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-3">
					<div className="flex items-center gap-2">
						<Input
							placeholder="Название"
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							maxLength={200}
							autoFocus
						/>
						<Button
							type="button"
							size="icon"
							variant="ghost"
							aria-pressed={favorite}
							aria-label={favorite ? "Убрать из избранного" : "В избранное"}
							onClick={() => setFavorite((value) => !value)}
							className="shrink-0"
						>
							<LuStar
								className={cn(
									"size-4",
									favorite && "fill-primary text-primary",
								)}
							/>
						</Button>
					</div>

					<div className="flex items-center gap-2">
						<Select value={selectValue} onValueChange={handleFolderSelect}>
							<SelectTrigger className="flex-1" aria-label="Папка">
								<SelectValue placeholder="Без папки" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NO_FOLDER}>Без папки</SelectItem>
								{folderOptions.map((name) => (
									<SelectItem key={name} value={name}>
										{name}
									</SelectItem>
								))}
								<SelectItem value={NEW_FOLDER}>＋ Новая папка…</SelectItem>
							</SelectContent>
						</Select>
						{creatingFolder && (
							<Input
								autoFocus
								placeholder="Название папки"
								value={newFolder}
								onChange={(event) => setNewFolder(event.target.value)}
								maxLength={120}
								className="flex-1"
							/>
						)}
					</div>

					<Textarea
						placeholder="Текст промпта"
						value={body}
						onChange={(event) => setBody(event.target.value)}
						className="min-h-44 resize-y font-mono text-sm"
					/>

					<div className="flex flex-col gap-1.5">
						<div className="flex flex-wrap items-center gap-1.5">
							{tags.map((tag) => (
								<Badge
									key={tag}
									variant="secondary"
									className="gap-1 pr-1 font-normal"
								>
									{tag}
									<button
										type="button"
										aria-label={`Удалить тег ${tag}`}
										onClick={() => removeTag(tag)}
										className="rounded-full p-0.5 hover:bg-foreground/10"
									>
										<LuX className="size-3" />
									</button>
								</Badge>
							))}
						</div>
						<Input
							placeholder="Добавить тег и Enter"
							value={tagInput}
							onChange={(event) => setTagInput(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === ",") {
									event.preventDefault();
									if (tagInput.trim().length > 0) commitTagInput();
								}
							}}
						/>
					</div>

					{detectedVariables.length > 0 && (
						<div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/30 p-2">
							<span className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
								<LuVariable className="size-3" />
								Обнаруженные переменные
							</span>
							{detectedVariables.map((name) => (
								<Badge key={name} variant="outline" className="font-mono">
									{name}
								</Badge>
							))}
						</div>
					)}
				</div>

				<DialogFooter>
					<Button variant="ghost" onClick={onClose}>
						Отмена
					</Button>
					<Button onClick={handleSubmit} disabled={saving}>
						{state.mode === "edit" ? "Сохранить" : "Создать"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
