import { toast } from "@rox/ui/sonner";
import { useState } from "react";
import { ExperimentalFeatureGate } from "renderer/components/ExperimentalFeatureGate";
import { TemplateGalleryModal } from "../TemplateGalleryModal";
import { TemplateMarketplacePanel } from "./TemplateMarketplacePanel";

interface TemplateMarketplaceLaunchpadProps {
	/** Optional fallback rendered when the experiment is off / unavailable. */
	fallback?: React.ReactNode;
	/** Called with the created project id after a template is applied. */
	onCreated?: (result: { projectId: string }) => void;
}

/**
 * Gated, self-contained entry point for the Template Marketplace experiment.
 * Renders the marketplace surface only when `templates.marketplace` is enabled
 * and available, and opens the existing {@link TemplateGalleryModal} — the real
 * project-creation engine — when the user picks a template. The modal is owned
 * here so the surface works on any route, independent of the dashboard's global
 * AddRepositoryModals instance.
 */
export function TemplateMarketplaceLaunchpad({
	fallback = null,
	onCreated,
}: TemplateMarketplaceLaunchpadProps) {
	const [galleryOpen, setGalleryOpen] = useState(false);

	return (
		<ExperimentalFeatureGate
			featureId="templates.marketplace"
			fallback={fallback}
		>
			<TemplateMarketplacePanel onOpenGallery={() => setGalleryOpen(true)} />
			<TemplateGalleryModal
				open={galleryOpen}
				onOpenChange={setGalleryOpen}
				onCreated={(result) => {
					setGalleryOpen(false);
					if (onCreated) onCreated(result);
					else
						toast.success("Проект создан из шаблона", {
							description: `ID проекта: ${result.projectId}`,
						});
				}}
				onError={(message) =>
					toast.error("Не удалось создать проект", { description: message })
				}
			/>
		</ExperimentalFeatureGate>
	);
}
