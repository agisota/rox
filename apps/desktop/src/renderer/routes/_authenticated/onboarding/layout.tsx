import { ChatServiceProvider } from "@rox/chat/client";
import { COMPANY } from "@rox/shared/constants";
import {
	canContinue as canContinueNav,
	createWizardNavState,
	probeGateSatisfied,
	type WizardStepId,
	withStepCopy,
} from "@rox/shared/wizard";
import { Button } from "@rox/ui/button";
import { OnboardingWizardShell } from "@rox/ui/onboarding-wizard-shell";
import { toast } from "@rox/ui/sonner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import {
	createFileRoute,
	Navigate,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { LuCircleHelp } from "react-icons/lu";
import { createChatServiceIpcClient } from "renderer/components/Chat/utils/chat-service-client";
import { track } from "renderer/lib/analytics";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { logger } from "renderer/lib/logger";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { useOnboardingProbeStore } from "./stores/onboarding-probe-store";

export const Route = createFileRoute("/_authenticated/onboarding")({
	component: OnboardingFlowLayout,
	validateSearch: (search: Record<string, unknown>): { rerun?: boolean } => ({
		rerun: search.rerun === true ? true : undefined,
	}),
});

/**
 * The formal 4-step onboarding model (F48, #637), backed by the neutral
 * `@rox/shared/wizard` step sequence. Each neutral step id maps to its concrete
 * desktop route + RU-localized copy; the shared {@link OnboardingWizardShell}
 * renders the chrome (header + dots + footer nav) so the layout no longer
 * hand-rolls the shell. Web + mobile consume the same neutral sequence with
 * connect-only capabilities.
 *
 * - `system`   → provider connect rows (page.tsx)
 * - `setup`    → live `/models` probe / credential step (credential/page.tsx)
 * - `workspace`→ open folder / clone (project/page.tsx)
 * - `finish`   → summary + finalize (finish/page.tsx)
 */
const STEP_ROUTES: Record<WizardStepId, string> = {
	system: "/onboarding",
	setup: "/onboarding/credential",
	workspace: "/onboarding/project",
	finish: "/onboarding/finish",
};

const STEPS = withStepCopy({
	system: {
		title: "Запуск Rox",
		subtitle: "Подключите агентов и инструменты, чтобы начать работу.",
	},
	setup: {
		title: "Проверьте провайдера моделей",
		subtitle:
			"Укажите Base URL и ключ API, чтобы получить список моделей через /models.",
		optional: true,
	},
	workspace: {
		title: "Покажите Rox, где находится код",
		subtitle:
			"Откройте папку или клонируйте репозиторий, чтобы продолжить запуск.",
	},
	finish: {
		title: "Запуск почти завершён",
		subtitle: "Проверьте, что всё готово, и переходите к работе.",
	},
});

function matchStepIndex(pathname: string): number {
	return STEPS.findIndex((step) => STEP_ROUTES[step.id] === pathname);
}

function OnboardingFlowLayout() {
	const {
		data: session,
		isPending,
		refetch: refetchSession,
	} = authClient.useSession();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === undefined || platform === "darwin";
	const chatClient = useMemo(() => createChatServiceIpcClient(), []);
	const location = useLocation();
	const navigate = useNavigate();
	const [finishing, setFinishing] = useState(false);
	const { rerun } = Route.useSearch();
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const probe = useOnboardingProbeStore((s) => s.probe);

	if (isPending) return null;
	// Already-onboarded users are redirected out — unless they explicitly
	// relaunched the flow from Settings (?rerun=true).
	if (session?.user?.onboardedAt && !rerun) {
		return <Navigate to="/" replace />;
	}

	const currentStepIdx = matchStepIndex(location.pathname);
	const isOnMainStep = currentStepIdx >= 0;
	const currentStep = isOnMainStep ? STEPS[currentStepIdx] : null;
	const navState = createWizardNavState(
		STEPS.length,
		Math.max(0, currentStepIdx),
	);
	const isFirstStep = currentStepIdx === 0;
	const isLastStep = currentStepIdx === STEPS.length - 1;

	const handleBack = () => {
		if (currentStepIdx <= 0) return;
		const target = STEPS[currentStepIdx - 1];
		if (!target) return;
		navigate({ to: STEP_ROUTES[target.id] });
	};

	// `setup` (probe) gates Continue on probe success; every other non-final
	// step has no gate. The final step finalizes instead of continuing.
	const gateSatisfied =
		currentStep?.id === "setup" ? probeGateSatisfied(probe) : true;

	const finalize = async (outcome: "completed" | "skipped") => {
		setFinishing(true);
		track("onboarding_finished", { outcome });
		try {
			await apiTrpcClient.user.completeOnboarding.mutate();
			// Reactive refetch so the layout guards' useSession() sees onboardedAt
			// before we navigate — otherwise the _authenticated guard bounces back.
			await refetchSession({ query: { disableCookieCache: true } });
		} catch (error) {
			logger.error("[onboarding] finalize failed", error);
			toast.error("Не удалось завершить запуск. Попробуйте ещё раз.");
			setFinishing(false);
			return;
		}
		await navigate({ to: "/v2-workspaces", replace: true });
	};

	// Continue advances to the next step; on the final step it finalizes.
	const handleContinue = isLastStep
		? () => void finalize("completed")
		: canContinueNav(navState, gateSatisfied)
			? () => {
					const target = STEPS[currentStepIdx + 1];
					if (target) navigate({ to: STEP_ROUTES[target.id] });
				}
			: null;

	// Skip is always available (setup is non-blocking, including a failed probe).
	// It marks the user onboarded so the _authenticated gate stops redirecting
	// here; unfinished steps can be completed later from Settings.
	const handleSkip = () => void finalize("skipped");

	const continueLabel = isLastStep ? "Завершить" : "Продолжить";

	return (
		<ChatServiceProvider client={chatClient} queryClient={electronQueryClient}>
			<div className="flex h-full w-full flex-col bg-background">
				<div
					className="drag h-12 w-full shrink-0"
					style={{ paddingLeft: isMac ? "88px" : "16px" }}
				/>
				{currentStep ? (
					<OnboardingWizardShell
						currentStep={currentStepIdx}
						totalSteps={STEPS.length}
						title={currentStep.title}
						subtitle={currentStep.subtitle}
						onBack={isFirstStep ? null : handleBack}
						onContinue={handleContinue}
						continueDisabled={
							isLastStep ? finishing : !canContinueNav(navState, gateSatisfied)
						}
						onSkip={handleSkip}
						skipDisabled={finishing}
						continueLabel={continueLabel}
						footerLeading={
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										size="icon-sm"
										variant="ghost"
										className="text-muted-foreground"
										aria-label="Поддержка"
										onClick={() => openUrl.mutate(COMPANY.REPORT_ISSUE_URL)}
									>
										<LuCircleHelp />
									</Button>
								</TooltipTrigger>
								<TooltipContent>Поддержка</TooltipContent>
							</Tooltip>
						}
					>
						<Outlet />
					</OnboardingWizardShell>
				) : (
					<div className="flex-1 overflow-auto">
						<Outlet />
					</div>
				)}
			</div>
		</ChatServiceProvider>
	);
}
