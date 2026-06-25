import { ChatServiceProvider } from "@rox/chat/client";
import {
	createFileRoute,
	Navigate,
	Outlet,
	useLocation,
} from "@tanstack/react-router";
import { useMemo } from "react";
import { createChatServiceIpcClient } from "renderer/components/Chat/utils/chat-service-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";

export const Route = createFileRoute("/_authenticated/onboarding")({
	component: OnboardingFlowLayout,
	validateSearch: (search: Record<string, unknown>): { rerun?: boolean } => ({
		rerun: search.rerun === true ? true : undefined,
	}),
});

/**
 * Onboarding shell (Ф4, #509). The two-step provider/project flow is replaced
 * by a single one-screen onboarding (Variant A) rendered by the index route, so
 * this layout is a thin frame: the window drag bar, the already-onboarded
 * redirect guard (bypassed via `?rerun=true` from Settings), and a full-bleed
 * outlet. The screen owns its own Start / Skip controls.
 */
function OnboardingFlowLayout() {
	const { data: session, isPending } = authClient.useSession();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === undefined || platform === "darwin";
	const chatClient = useMemo(() => createChatServiceIpcClient(), []);
	const location = useLocation();
	const { rerun } = Route.useSearch();

	if (isPending) return null;
	// Already-onboarded users are redirected out — unless they explicitly
	// relaunched the flow from Settings (?rerun=true).
	if (
		session?.user?.onboardedAt &&
		!rerun &&
		location.pathname === "/onboarding"
	) {
		return <Navigate to="/" replace />;
	}

	return (
		<ChatServiceProvider client={chatClient} queryClient={electronQueryClient}>
			<div className="flex h-full w-full flex-col bg-background">
				<div
					className="drag h-12 w-full shrink-0"
					style={{ paddingLeft: isMac ? "88px" : "16px" }}
				/>
				<div className="min-h-0 flex-1 overflow-auto">
					<Outlet />
				</div>
			</div>
		</ChatServiceProvider>
	);
}
