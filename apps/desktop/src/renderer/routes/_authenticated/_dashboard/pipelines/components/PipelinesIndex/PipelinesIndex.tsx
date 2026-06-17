import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@rox/ui/dialog";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { toast } from "@rox/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Network, Plus, Workflow } from "lucide-react";
import { useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { PIPELINE_TEMPLATES } from "../templates";

/** Kebab-case a free-text name into a slug seed. */
function slugify(input: string): string {
	return input
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60);
}

/**
 * The pipelines index: lists the org's agent pipelines and creates a new one
 * from a template (or blank). A pipeline is a `workflow_definitions` row with
 * `engine="pipeline"`; creation seeds the chosen template's graph as the draft.
 *
 * Cache-first (AGENTS.md rule 9): existing pipeline rows render immediately.
 */
export function PipelinesIndex() {
	const trpc = useTRPC();
	const navigate = useNavigate();
	const queryClient = useQueryClient();

	const [dialogOpen, setDialogOpen] = useState(false);
	const [templateId, setTemplateId] = useState(PIPELINE_TEMPLATES[0]?.id ?? "");
	const [name, setName] = useState("");

	const pipelinesQuery = useQuery(trpc.pipeline.list.queryOptions(undefined));

	const createMutation = useMutation(
		trpc.pipeline.createDraft.mutationOptions({
			onSuccess: async (row) => {
				await queryClient.invalidateQueries({
					queryKey: trpc.pipeline.list.queryKey(undefined),
				});
				setDialogOpen(false);
				setName("");
				navigate({
					to: "/pipelines/$pipelineId",
					params: { pipelineId: row.id },
				});
			},
			onError: (error) => {
				console.error("[PipelinesIndex] createDraft failed", error);
				toast.error("Не удалось создать пайплайн");
			},
		}),
	);

	const pipelines = pipelinesQuery.data ?? [];

	const handleCreate = () => {
		const template =
			PIPELINE_TEMPLATES.find((t) => t.id === templateId) ??
			PIPELINE_TEMPLATES[0];
		if (!template) return;
		const finalName = name.trim() || template.name;
		const slug = `${slugify(finalName) || template.slugSeed}-${Date.now()
			.toString(36)
			.slice(-4)}`;
		createMutation.mutate({
			name: finalName,
			slug,
			draftState: template.build(),
		});
	};

	return (
		<div className="mx-auto w-full max-w-5xl px-4 py-6">
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="flex items-center gap-2 text-xl font-medium">
						<Network className="size-5 text-primary" /> Пайплайны агентов
					</h1>
					<p className="text-sm text-muted-foreground">
						Конструктор графов из агентов-ролей, триггеров и гейтов.
					</p>
				</div>

				<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
					<DialogTrigger asChild>
						<Button>
							<Plus className="size-4" /> Новый пайплайн
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Новый пайплайн</DialogTitle>
							<DialogDescription>
								Выберите шаблон графа — его можно отредактировать на холсте.
							</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col gap-3">
							<div className="flex flex-col gap-1.5">
								<Label htmlFor="pipeline-name">Название</Label>
								<Input
									id="pipeline-name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="Например: Ревью кода"
								/>
							</div>
							<div className="flex flex-col gap-2">
								<Label>Шаблон</Label>
								<div className="grid gap-2">
									{PIPELINE_TEMPLATES.map((template) => (
										<button
											key={template.id}
											type="button"
											onClick={() => setTemplateId(template.id)}
											className={`flex flex-col items-start gap-0.5 rounded-md border p-3 text-left transition-colors hover:border-primary/50 ${
												template.id === templateId
													? "border-primary bg-primary/5"
													: ""
											}`}
										>
											<span className="text-sm font-medium">
												{template.name}
											</span>
											<span className="text-xs text-muted-foreground">
												{template.description}
											</span>
										</button>
									))}
								</div>
							</div>
						</div>
						<DialogFooter>
							<Button
								disabled={createMutation.isPending}
								onClick={handleCreate}
							>
								Создать
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</div>

			{pipelines.length === 0 && !pipelinesQuery.isLoading && (
				<div className="rounded-lg border border-dashed p-10 text-center">
					<Workflow className="mx-auto mb-3 size-8 text-muted-foreground" />
					<p className="text-sm text-muted-foreground">
						Пока нет пайплайнов. Создайте первый из шаблона.
					</p>
				</div>
			)}

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{pipelines.map((pipeline) => (
					<button
						key={pipeline.id}
						type="button"
						onClick={() =>
							navigate({
								to: "/pipelines/$pipelineId",
								params: { pipelineId: pipeline.id },
							})
						}
						className="flex flex-col items-start gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50"
					>
						<div className="flex w-full items-center gap-2">
							<Workflow className="size-4 text-primary" />
							<span className="flex-1 truncate text-sm font-medium">
								{pipeline.name}
							</span>
							{pipeline.status === "archived" && (
								<Badge variant="outline" className="text-[10px]">
									архив
								</Badge>
							)}
						</div>
						<span className="truncate font-mono text-[11px] text-muted-foreground">
							{pipeline.slug}
						</span>
						{pipeline.description && (
							<p className="line-clamp-2 text-xs text-muted-foreground">
								{pipeline.description}
							</p>
						)}
					</button>
				))}
			</div>
		</div>
	);
}
