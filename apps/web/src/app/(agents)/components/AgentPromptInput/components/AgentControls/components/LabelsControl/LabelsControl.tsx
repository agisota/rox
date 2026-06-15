"use client";

import { PromptInputButton } from "@rox/ui/ai-elements/prompt-input";
import { Input } from "@rox/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@rox/ui/popover";
import { Tags, X } from "lucide-react";
import { type KeyboardEvent, useState } from "react";

type LabelsControlProps = {
	labels: string[];
	onAdd: (label: string) => void;
	onRemove: (label: string) => void;
};

/**
 * Free-form session labels: type + Enter to add, click a chip to remove. Dedup
 * and trimming are owned by the parent hook (`addLabel`).
 */
export function LabelsControl({ labels, onAdd, onRemove }: LabelsControlProps) {
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState("");

	const commit = () => {
		onAdd(draft);
		setDraft("");
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter") {
			event.preventDefault();
			commit();
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<PromptInputButton aria-label="Метки сессии" aria-haspopup="dialog">
					<Tags className="size-3.5" />
					<span>
						{labels.length > 0 ? `Метки · ${labels.length}` : "Метки"}
					</span>
				</PromptInputButton>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 space-y-2 p-2">
				<Input
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Метка и Enter"
					aria-label="Новая метка"
					className="h-8 text-xs"
				/>
				{labels.length > 0 && (
					<ul className="flex flex-wrap gap-1">
						{labels.map((label) => (
							<li key={label}>
								<button
									type="button"
									onClick={() => onRemove(label)}
									aria-label={`Удалить метку ${label}`}
									className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground text-xs transition-colors hover:bg-secondary/80"
								>
									<span className="max-w-32 truncate">{label}</span>
									<X className="size-3" />
								</button>
							</li>
						))}
					</ul>
				)}
			</PopoverContent>
		</Popover>
	);
}
