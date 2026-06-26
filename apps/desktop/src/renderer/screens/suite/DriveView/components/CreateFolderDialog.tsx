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
import { useState } from "react";

interface CreateFolderDialogProps {
	open: boolean;
	pending: boolean;
	onOpenChange: (open: boolean) => void;
	onCreate: (name: string) => void;
}

/** Name input for a new folder in the current location; Enter-to-confirm. */
export function CreateFolderDialog({
	open,
	pending,
	onOpenChange,
	onCreate,
}: CreateFolderDialogProps) {
	const [name, setName] = useState("");

	const submit = () => {
		const trimmed = name.trim();
		if (trimmed.length === 0) return;
		onCreate(trimmed);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				if (!next) setName("");
				onOpenChange(next);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Новая папка</DialogTitle>
					<DialogDescription>
						Папка будет создана в текущем расположении.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-1.5">
					<Label htmlFor="drive-folder-name">Название</Label>
					<Input
						id="drive-folder-name"
						value={name}
						autoFocus
						onChange={(event) => setName(event.target.value)}
						placeholder="Например: Документы"
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								submit();
							}
						}}
					/>
				</div>
				<DialogFooter>
					<Button
						disabled={name.trim().length === 0 || pending}
						onClick={submit}
					>
						{pending ? "Создание…" : "Создать"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
