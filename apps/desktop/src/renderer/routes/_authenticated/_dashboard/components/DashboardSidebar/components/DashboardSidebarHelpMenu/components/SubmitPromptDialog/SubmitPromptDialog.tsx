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
import { Label } from "@rox/ui/label";
import { toast } from "@rox/ui/sonner";
import { Textarea } from "@rox/ui/textarea";
import { useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

interface SubmitPromptDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function SubmitPromptDialog({
	open,
	onOpenChange,
}: SubmitPromptDialogProps) {
	const [promptText, setPromptText] = useState("");
	const [submitterName, setSubmitterName] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const reset = () => {
		setPromptText("");
		setSubmitterName("");
		setIsSubmitting(false);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next) reset();
		onOpenChange(next);
	};

	const canSubmit = promptText.trim().length > 0 && !isSubmitting;

	const handleSubmit = async () => {
		if (!canSubmit) return;
		setIsSubmitting(true);
		try {
			await apiTrpcClient.support.submitPrompt.mutate({
				promptText: promptText.trim(),
				submitterName: submitterName.trim() || undefined,
			});
			toast.success("Промпт отправлен — спасибо!");
			handleOpenChange(false);
		} catch (error) {
			console.error("[submit-prompt] failed", error);
			toast.error("Не удалось отправить промпт. Попробуйте ещё раз.");
			setIsSubmitting(false);
		}
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
			event.preventDefault();
			void handleSubmit();
		}
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Предложить промпт</DialogTitle>
					<DialogDescription>
						Поручите кодинг-агенту собрать то, что вы хотите увидеть в Rox. Если
						нам понравится ваш промпт, мы запустим его и вольём результат.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-4 py-2">
					<div className="flex flex-col gap-2">
						<Label htmlFor="submit-prompt-text">Промпт</Label>
						<Textarea
							id="submit-prompt-text"
							value={promptText}
							onChange={(e) => setPromptText(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Опишите, что вы хотите, чтобы мы создали…"
							rows={6}
							autoFocus
							disabled={isSubmitting}
						/>
					</div>
					<div className="flex flex-col gap-2">
						<Label htmlFor="submit-prompt-name">
							Ваше имя{" "}
							<span className="font-normal text-muted-foreground">
								(если мы используем ваш промпт, мы укажем вас в списке
								изменений)
							</span>
						</Label>
						<Input
							id="submit-prompt-name"
							value={submitterName}
							onChange={(e) => setSubmitterName(e.target.value)}
							placeholder="Иван Иванов"
							disabled={isSubmitting}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
						{isSubmitting ? "Отправка…" : "Отправить промпт"}
						<span className="ml-2 inline-flex items-center gap-1 text-base font-mono tabular-nums opacity-80">
							<span>⌘</span>
							<span>↵</span>
						</span>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
