import { SidebarCard } from "@rox/ui/sidebar-card";
import { useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { track } from "renderer/lib/analytics";
import { useV2AvailableBannerStore } from "renderer/stores/v2-available-banner";

export function V2AvailableBanner() {
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const dismissed = useV2AvailableBannerStore((s) => s.dismissed);
	const dismiss = useV2AvailableBannerStore((s) => s.dismiss);
	const navigate = useNavigate();

	function handleManage() {
		track("v2_banner_manage_clicked");
		navigate({ to: "/settings/experimental" });
	}

	function handleDismiss() {
		track("v2_banner_dismissed");
		dismiss();
	}

	if (isV2CloudEnabled) return null;

	return (
		<AnimatePresence>
			{!dismissed && (
				<motion.div
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: 8 }}
					transition={{ duration: 0.2 }}
					className="px-3 pb-2"
				>
					<SidebarCard
						badge="Новое"
						title="Rox v2 уже здесь"
						description="Попробуйте новый облачный опыт работы с пространствами."
						actionLabel="Попробовать новую версию Rox"
						onAction={handleManage}
						onDismiss={handleDismiss}
					/>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
