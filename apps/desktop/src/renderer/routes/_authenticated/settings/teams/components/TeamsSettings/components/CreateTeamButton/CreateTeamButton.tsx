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
import { useState } from "react";
import { authClient } from "renderer/lib/auth-client";

interface CreateTeamButtonProps {
	organizationId: string;
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function CreateTeamButton({ organizationId }: CreateTeamButtonProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugEdited, setSlugEdited] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	function handleNameChange(value: string) {
		setName(value);
		if (!slugEdited) setSlug(slugify(value));
	}

	function handleSlugChange(value: string) {
		setSlug(value);
		setSlugEdited(true);
	}

	function reset() {
		setName("");
		setSlug("");
		setSlugEdited(false);
	}

	async function handleSubmit(event: React.FormEvent) {
		event.preventDefault();
		const trimmedName = name.trim();
		const trimmedSlug = slug.trim();
		if (!trimmedName || !trimmedSlug) return;

		setIsSubmitting(true);
		try {
			const result = await authClient.organization.createTeam({
				name: trimmedName,
				slug: trimmedSlug,
				organizationId,
			});
			if (result.error) {
				toast.error(result.error.message ?? "Не удалось создать команду");
				return;
			}
			toast.success(`Команда "${trimmedName}" создана`);
			reset();
			setIsOpen(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Не удалось создать команду",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<>
			<Button onClick={() => setIsOpen(true)}>Создать команду</Button>
			<Dialog
				open={isOpen}
				onOpenChange={(open) => {
					setIsOpen(open);
					if (!open) reset();
				}}
			>
				<DialogContent>
					<form onSubmit={handleSubmit}>
						<DialogHeader>
							<DialogTitle>Создать команду</DialogTitle>
							<DialogDescription>
								Укажите название и slug для URL. Их можно изменить позже.
							</DialogDescription>
						</DialogHeader>
						<div className="my-4 space-y-4">
							<div className="space-y-1.5">
								<Label htmlFor="team-name">Название</Label>
								<Input
									id="team-name"
									value={name}
									onChange={(event) => handleNameChange(event.target.value)}
									placeholder="например, Разработка"
									autoFocus
									required
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="team-slug">Слаг</Label>
								<Input
									id="team-slug"
									value={slug}
									onChange={(event) => handleSlugChange(event.target.value)}
									placeholder="например, razrabotka"
									required
								/>
							</div>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="ghost"
								onClick={() => setIsOpen(false)}
								disabled={isSubmitting}
							>
								Отмена
							</Button>
							<Button
								type="submit"
								disabled={!name.trim() || !slug.trim() || isSubmitting}
							>
								{isSubmitting ? "Создание..." : "Создать"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	);
}
