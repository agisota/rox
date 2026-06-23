import {
	deriveTemplatePreview,
	type TemplatePreviewPlan,
} from "@rox/shared/template-preview-sandbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { toast } from "@rox/ui/sonner";
import { useState } from "react";
import { ExperimentalFeatureGate } from "renderer/components/ExperimentalFeatureGate";
import { HostStatusInline } from "renderer/components/HostStatusInline";
import { useExperimentalFeature } from "renderer/hooks/useExperimentalFeature";
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
import { TemplatePreviewSandboxPanel } from "./components/TemplatePreviewSandboxPanel";
import { getTemplateSelectAction } from "./preview-sandbox-action";
import { PROJECT_TEMPLATES, type ProjectTemplate } from "./templates";

interface TemplateGalleryModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onCreated: (result: {
		projectId: string;
		mainWorkspaceId: string | null;
	}) => void;
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
	const { activeHostUrl } = useLocalHostService();
	const { hostReady } = useHostReadiness();
	const finalizeSetup = useFinalizeProjectSetup();
	const createV1Project = useCreateV1Project();
	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery();
	const parentDir = homeDir ? `${homeDir}/.rox/projects` : null;
	const [cloningId, setCloningId] = useState<string | null>(null);
	// Template Preview Sandbox (experiment): when enabled+available, selecting a
	// template first shows a dry-run preview of what it WOULD create before the
	// existing apply path runs. When the gate is closed, selection applies
	// immediately exactly as before.
	const { state: previewSandboxState } = useExperimentalFeature(
		"templates.previewSandbox",
	);
	const previewSandboxEnabled =
		previewSandboxState.enabled &&
		previewSandboxState.availability === "available";
	const [preview, setPreview] = useState<{
		template: ProjectTemplate;
		plan: TemplatePreviewPlan;
	} | null>(null);

	const applyTemplate = async (template: ProjectTemplate) => {
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
		let createdMainWorkspaceId: string | null = null;
		try {
			if (isV2CloudEnabled) {
				// Pre-gated: the template cards are disabled until `hostReady`, and the
				// inline status drives recovery — so a missing host here is just a
				// defensive no-op, not a postfacto toast.
				if (!activeHostUrl) return;
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
				createdMainWorkspaceId = result.mainWorkspaceId;
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
		if (createdProjectId) {
			setPreview(null);
			onCreated({
				projectId: createdProjectId,
				mainWorkspaceId: createdMainWorkspaceId,
			});
		}
	};

	// Card click router: with the preview sandbox enabled, a previewable template
	// opens its dry-run preview first; otherwise (or for non-previewable
	// templates) it applies immediately, preserving the original behaviour. The
	// decision itself lives in `getTemplateSelectAction` so it is unit-testable
	// without the renderer/tRPC stack.
	const handleCardSelect = (template: ProjectTemplate) => {
		if (cloningId) return;
		if (
			getTemplateSelectAction(template, previewSandboxEnabled) === "preview"
		) {
			setPreview({ template, plan: deriveTemplatePreview(template) });
			return;
		}
		void applyTemplate(template);
	};

	const closePreview = () => {
		if (cloningId) return;
		setPreview(null);
	};

	const handleOpenChange = (next: boolean) => {
		if (!next && cloningId) return;
		if (!next) setPreview(null);
		onOpenChange(next);
	};

	const templateGrid = (
		<div className="grid grid-cols-3 gap-3">
			{PROJECT_TEMPLATES.map((template) => (
				<TemplateCard
					key={template.id}
					template={template}
					cloning={cloningId === template.id}
					disabled={
						cloningId !== null || !parentDir || (isV2CloudEnabled && !hostReady)
					}
					presetOnlyEnabled={isV2CloudEnabled}
					onSelect={handleCardSelect}
				/>
			))}
		</div>
	);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				className="sm:max-w-5xl"
				onOpenAutoFocus={(event) => event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>
						{preview ? "Предпросмотр шаблона" : "Начать с шаблона"}
					</DialogTitle>
					<DialogDescription>
						{preview
							? "Сухой прогон: что создаст шаблон, прежде чем вы примените его."
							: "Создайте проект из репозитория или пустой git-workspace с готовыми пресетами."}
					</DialogDescription>
				</DialogHeader>
				{isV2CloudEnabled && <HostStatusInline />}
				{preview ? (
					// Defense-in-depth: the preview step only opens while the experiment
					// is enabled+available (handleCardSelect gates on the same state),
					// but wrapping the surface in the gate makes the contract explicit
					// and falls back to the grid if the experiment is turned off mid-flow.
					<ExperimentalFeatureGate
						featureId="templates.previewSandbox"
						fallback={templateGrid}
					>
						<TemplatePreviewSandboxPanel
							plan={preview.plan}
							applying={cloningId === preview.template.id}
							onBack={closePreview}
							onApply={() => void applyTemplate(preview.template)}
						/>
					</ExperimentalFeatureGate>
				) : (
					templateGrid
				)}
			</DialogContent>
		</Dialog>
	);
}
