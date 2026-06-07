import { toast } from "@rox/ui/sonner";

export function showWorkspaceAutoNameWarningToast({
	description,
	onOpenModelAuthSettings,
}: {
	description: string;
	onOpenModelAuthSettings: () => void;
}) {
	toast.warning("Workspace used a fallback name", {
		description,
		action: {
			label: "Open Models",
			onClick: onOpenModelAuthSettings,
		},
	});
}
