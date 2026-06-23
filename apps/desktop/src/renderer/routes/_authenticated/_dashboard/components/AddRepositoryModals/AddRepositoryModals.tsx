import { toast } from "@rox/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { TemplateGalleryModal } from "renderer/routes/_authenticated/components/TemplateGalleryModal";
import {
	useAddRepositoryModalActive,
	useCloseAddRepositoryModal,
	useResolveNewProjectModal,
} from "renderer/stores/add-repository-modal";
import { resolveNewProjectIntent } from "renderer/stores/utils/resolveNewProjectIntent";
import { GitHubPublishDialog } from "./components/GitHubPublishDialog";
import { GitInitConfirmDialog } from "./components/GitInitConfirmDialog";
import { NewProjectModal } from "./components/NewProjectModal";
import { useOfferGitHubPublish } from "./hooks/useOfferGitHubPublish";

export function AddRepositoryModals() {
	const active = useAddRepositoryModalActive();
	const close = useCloseAddRepositoryModal();
	const resolveNewProject = useResolveNewProjectModal();
	const offerGitHubPublish = useOfferGitHubPublish();
	const navigate = useNavigate();

	const maybeOpenWorkspace = (
		intent: "open" | "return-id",
		mainWorkspaceId: string | null,
	) => {
		const decision = resolveNewProjectIntent(intent, mainWorkspaceId);
		if (decision.kind === "navigate-workspace") {
			void navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: decision.workspaceId },
			});
		}
	};

	return (
		<>
			<NewProjectModal
				open={active.kind === "new-project"}
				onOpenChange={(open) => {
					if (!open) close();
				}}
				onSuccess={(result) => {
					toast.success("Project created.");
					const intent =
						active.kind === "new-project" ? active.intent : "return-id";
					resolveNewProject({
						projectId: result.projectId,
						mainWorkspaceId: result.mainWorkspaceId,
					});
					maybeOpenWorkspace(intent, result.mainWorkspaceId);
				}}
				onError={(message) => toast.error(`Create failed: ${message}`)}
			/>
			<TemplateGalleryModal
				open={active.kind === "template-gallery"}
				onOpenChange={(open) => {
					if (!open) close();
				}}
				onCreated={(result) => {
					toast.success("Project created.");
					const intent =
						active.kind === "template-gallery" ? active.intent : "return-id";
					resolveNewProject({
						projectId: result.projectId,
						mainWorkspaceId: result.mainWorkspaceId,
					});
					maybeOpenWorkspace(intent, result.mainWorkspaceId);
					// Template projects are local-only (no remote). Offer an optional
					// GitHub publish — no-op unless gh is installed && authenticated.
					offerGitHubPublish({ projectId: result.projectId });
				}}
				onError={(message) => toast.error(`Create failed: ${message}`)}
			/>
			<GitInitConfirmDialog />
			<GitHubPublishDialog />
		</>
	);
}
