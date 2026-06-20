import { toast } from "@rox/ui/sonner";
import { TemplateGalleryModal } from "renderer/routes/_authenticated/components/TemplateGalleryModal";
import {
	useAddRepositoryModalActive,
	useCloseAddRepositoryModal,
	useResolveNewProjectModal,
} from "renderer/stores/add-repository-modal";
import { GitHubPublishDialog } from "./components/GitHubPublishDialog";
import { GitInitConfirmDialog } from "./components/GitInitConfirmDialog";
import { NewProjectModal } from "./components/NewProjectModal";
import { useOfferGitHubPublish } from "./hooks/useOfferGitHubPublish";

export function AddRepositoryModals() {
	const active = useAddRepositoryModalActive();
	const close = useCloseAddRepositoryModal();
	const resolveNewProject = useResolveNewProjectModal();
	const offerGitHubPublish = useOfferGitHubPublish();

	return (
		<>
			<NewProjectModal
				open={active.kind === "new-project"}
				onOpenChange={(open) => {
					if (!open) close();
				}}
				onSuccess={(result) => {
					toast.success("Project created.");
					resolveNewProject({ projectId: result.projectId });
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
					resolveNewProject({ projectId: result.projectId });
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
