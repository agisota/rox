import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { cn } from "@rox/ui/utils";
import { useEffect, useState } from "react";
import { LuX } from "react-icons/lu";

interface WorkspaceLabelsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	labels: string[];
	onSave: (labels: string[]) => void;
}

/**
 * Edit a branch's free-text labels/tags. Add via Enter or the button, remove
 * via the chip's ✕. Changes are committed on Save (cancel discards the draft).
 */
export function WorkspaceLabelsDialog({
	open,
	onOpenChange,
	labels,
	onSave,
}: WorkspaceLabelsDialogProps) {
	const [draft, setDraft] = useState<string[]>(labels);
	const [input, setInput] = useState("");

	useEffect(() => {
		if (open) {
			setDraft(labels);
			setInput("");
		}
	}, [open, labels]);

	const addLabel = () => {
		const value = input.trim();
		if (!value) return;
		if (!draft.includes(value)) setDraft([...draft, value]);
		setInput("");
	};

	const removeLabel = (label: string) => {
		setDraft((current) => current.filter((item) => item !== label));
	};

	const save = () => {
		onSave(draft);
		onOpenChange(false);
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Метки ветки</DialogTitle>
				</DialogHeader>

				<div className="flex min-h-7 flex-wrap items-center gap-1.5">
					{draft.length === 0 ? (
						<span className="text-sm text-muted-foreground">
							Меток пока нет
						</span>
					) : (
						draft.map((label) => (
							<span
								key={label}
								className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
							>
								{label}
								<button
									type="button"
									onClick={() => removeLabel(label)}
									aria-label={`Удалить метку ${label}`}
									className="text-muted-foreground transition-colors hover:text-foreground"
								>
									<LuX className="size-3" />
								</button>
							</span>
						))
					)}
				</div>

				<div className="flex items-center gap-2">
					<input
						value={input}
						onChange={(event) => setInput(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								addLabel();
							}
						}}
						placeholder="Добавить метку и Enter…"
						className={cn(
							"h-8 flex-1 rounded-md border border-border bg-background px-2.5 text-sm",
							"outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
					/>
					<Button type="button" variant="outline" size="sm" onClick={addLabel}>
						Добавить
					</Button>
				</div>

				<div className="flex justify-end gap-2">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() => onOpenChange(false)}
					>
						Отмена
					</Button>
					<Button type="button" size="sm" onClick={save}>
						Сохранить
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
