import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { toast } from "@rox/ui/sonner";
import { useState } from "react";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { showHostServiceUnavailableToast } from "renderer/lib/host-service-unavailable";
import {
	useCreateV1Project,
	useFinalizeProjectSetup,
} from "renderer/react-query/projects";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { TemplateCard } from "./components/TemplateCard";
import { PROJECT_TEMPLATES, type ProjectTemplate } from "./templates";

interface TemplateGalleryModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: (result: { projectId: string }) => void;
	onError?: (message: string) => void;
}

function deriveProjectNameFromUrl(url: string): string {
	const trimmed = url
		.trim()
		.replace(/[?#].*$/, "")
		.replace(/[\\/]+$/, "")
		.replace(/\.git$/i, "");
	const segments = trimmed.split(/[/:\\]/).filter(Boolean);
	return segments[segments.length - 1] ?? "";
}

function isTemplateAvailable(template: ProjectTemplate): boolean {
	return !!template.repo || !!template.starterPresetIds?.length;
}

function deriveProjectNameFromTemplate(template: ProjectTemplate): string {
	if (template.repo) return deriveProjectNameFromUrl(template.repo);
	return template.defaultProjectName ?? template.id;
}

export function TemplateGalleryModal({
	open,
	onOpenChange,
	onCreated,
	onError,
}: TemplateGalleryModalProps) {
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const hostService = useLocalHostService();
	const { activeHostUrl } = hostService;
	const finalizeSetup = useFinalizeProjectSetup();
	const createV1Project = useCreateV1Project();
	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery();
	const parentDir = homeDir ? `${homeDir}/.rox/projects` : null;
	const [cloningId, setCloningId] = useState<string | null>(null);

	const handleSelect = async (template: ProjectTemplate) => {
		if (!isTemplateAvailable(template) || cloningId) return;
		if (!parentDir) {
			const message = "Каталог проектов ещё не готов.";
			if (onError) onError(message);
			else toast.error("Не удалось создать проект", { description: message });
			return;
		}
		if (!isV2CloudEnabled && !template.repo) {
			const message =
				"Пресет без репозитория доступен только в новом проектном флоу.";
			if (onError) onError(message);
			else toast.error("Не удалось создать проект", { description: message });
			return;
		}
		setCloningId(template.id);
		let createdProjectId: string | null = null;
		try {
			if (isV2CloudEnabled) {
				if (!activeHostUrl) {
					showHostServiceUnavailableToast(hostService, {
						action: "create the project",
					});
					return;
				}
				const client = getHostServiceClientByUrl(activeHostUrl);
				const result = await client.project.create.mutate({
					name: deriveProjectNameFromTemplate(template),
					mode: template.repo
						? { kind: "template", parentDir, url: template.repo }
						: { kind: "empty", parentDir },
					starterPresetIds: template.starterPresetIds
						? [...template.starterPresetIds]
						: undefined,
				});
				finalizeSetup(activeHostUrl, result);
				createdProjectId = result.projectId;
			} else if (template.repo) {
				createdProjectId = await createV1Project.createFromTemplate({
					repoUrl: template.repo,
					parentDir,
				});
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			if (onError) onError(message);
			else toast.error("Не удалось создать проект", { description: message });
		} finally {
			setCloningId(null);
		}
		if (createdProjectId) onCreated({ projectId: createdProjectId });
	};

	const handleOpenChange = (next: boolean) => {
		if (!next && cloningId) return;
		onOpenChange(next);
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				className="sm:max-w-5xl"
				onOpenAutoFocus={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Начать с шаблона</DialogTitle>
					<DialogDescription>
						Создайте проект из репозитория или пустой git-workspace с готовыми
						пресетами.
					</DialogDescription>
				</DialogHeader>
				<div className="grid grid-cols-3 gap-3">
					{PROJECT_TEMPLATES.map((template) => (
						<TemplateCard
							key={template.id}
							template={template}
							cloning={cloningId === template.id}
							disabled={cloningId !== null || !parentDir}
							onSelect={handleSelect}
						/>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
