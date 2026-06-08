import type { KnowledgeDocumentType } from "@rox/shared/knowledge";
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
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { toast } from "@rox/ui/sonner";
import { Textarea } from "@rox/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { DOCUMENT_TYPES } from "../../constants";
import { slugify } from "../../utils/slugify";

interface CreateDocumentDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function CreateDocumentDialog({
	open,
	onOpenChange,
}: CreateDocumentDialogProps) {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [title, setTitle] = useState("");
	const [type, setType] = useState<KnowledgeDocumentType>("note");
	const [markdown, setMarkdown] = useState("");

	const slug = useMemo(() => slugify(title), [title]);

	const reset = () => {
		setTitle("");
		setType("note");
		setMarkdown("");
	};

	const createMutation = useMutation({
		mutationFn: () =>
			apiTrpcClient.knowledge.create.mutate({
				type,
				slug,
				title: title.trim(),
				markdown: markdown.trim() ? markdown : undefined,
			}),
		onSuccess: (doc) => {
			queryClient.invalidateQueries({ queryKey: ["knowledge"] });
			toast.success(`Created "${doc.title}"`);
			onOpenChange(false);
			reset();
			navigate({ to: "/notebook/$slug", params: { slug: doc.slug } });
		},
		onError: (error) =>
			toast.error(
				error instanceof Error ? error.message : "Failed to create document",
			),
	});

	const canSubmit = title.trim().length > 0 && slug.length > 0;

	const handleOpenChange = (next: boolean) => {
		onOpenChange(next);
		if (!next) reset();
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>New document</DialogTitle>
					<DialogDescription>
						Create a note, PRD, spec, or doc in your team notebook.
					</DialogDescription>
				</DialogHeader>

				<form
					id="create-knowledge-document"
					className="flex flex-col gap-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (canSubmit) createMutation.mutate();
					}}
				>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="knowledge-title">Title</Label>
						<Input
							id="knowledge-title"
							value={title}
							onChange={(event) => setTitle(event.target.value)}
							placeholder="Untitled document"
							autoFocus
						/>
						{slug ? (
							<p className="text-xs text-muted-foreground">
								Slug: <code className="font-mono">{slug}</code>
							</p>
						) : null}
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="knowledge-type">Type</Label>
						<Select
							value={type}
							onValueChange={(value) => setType(value as KnowledgeDocumentType)}
						>
							<SelectTrigger id="knowledge-type">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{DOCUMENT_TYPES.map((option) => (
									<SelectItem key={option.value} value={option.value}>
										{option.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="flex flex-col gap-1.5">
						<Label htmlFor="knowledge-markdown">Content (optional)</Label>
						<Textarea
							id="knowledge-markdown"
							value={markdown}
							onChange={(event) => setMarkdown(event.target.value)}
							placeholder={
								"# Heading\n\nWrite Markdown here. Link with [[other-doc]]."
							}
							className="min-h-32 font-mono text-sm"
						/>
					</div>
				</form>

				<DialogFooter>
					<Button
						type="button"
						variant="ghost"
						onClick={() => handleOpenChange(false)}
					>
						Cancel
					</Button>
					<Button
						type="submit"
						form="create-knowledge-document"
						disabled={!canSubmit || createMutation.isPending}
					>
						Create
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
