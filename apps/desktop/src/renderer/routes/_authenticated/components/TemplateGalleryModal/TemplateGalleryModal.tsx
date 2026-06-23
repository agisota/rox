import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { toast } from "@rox/ui/sonner";
import { useState } from "react";
import { HostStatusInline } from "renderer/components/HostStatusInline";
import { useHostReadiness } from "renderer/hooks/useHostReadiness";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
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

export function TemplateGalleryModal({
	open,
	onOpenChange,
	onCreated,
	onError,
}: TemplateGalleryModalProps) {
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const { activeHostUrl } = useLocalHostService();
	const { hostReady } = useHostReadiness();
	const finalizeSetup = useFinalizeProjectSetup();
	const createV1Project = useCreateV1Project();
	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery();
	const parentDir = homeDir ? `${homeDir}/.rox/projects` : null;
	const [cloningId, setCloningId] = useState<string | null>(null);

	const handleSelect = async (template: ProjectTemplate) => {
		if (!template.repo || cloningId) return;
		if (!parentDir) {
			const message = "Каталог проектов ещё не готов.";
			if (onError) onError(message);
			else toast.error("Не удалось создать проект", { description: message });
			return;
		}
		setCloningId(template.id);
		let createdProjectId: string | null = null;
		try {
			if (isV2CloudEnabled) {
				// Pre-gated: the template cards are disabled until `hostReady`, and the
				// inline status drives recovery — so a missing host here is just a
				// defensive no-op, not a postfacto toast.
				if (!activeHostUrl) return;
				const client = getHostServiceClientByUrl(activeHostUrl);
				const result = await client.project.create.mutate({
					name: deriveProjectNameFromUrl(template.repo),
					mode: { kind: "template", parentDir, url: template.repo },
				});
				finalizeSetup(activeHostUrl, result);
				createdProjectId = result.projectId;
			} else {
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
						Создайте новый проект из стартера — клонируется с чистой историей
						git.
					</DialogDescription>
				</DialogHeader>
				{isV2CloudEnabled && <HostStatusInline />}
				<div className="grid grid-cols-3 gap-3">
					{PROJECT_TEMPLATES.map((template) => (
						<TemplateCard
							key={template.id}
							template={template}
							cloning={cloningId === template.id}
							disabled={
								cloningId !== null ||
								!parentDir ||
								(isV2CloudEnabled && !hostReady)
							}
							onSelect={handleSelect}
						/>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
