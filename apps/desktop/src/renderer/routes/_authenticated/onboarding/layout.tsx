import { ChatServiceProvider } from "@rox/chat/client";
import { motionDuration, useShouldAnimate } from "@rox/ui/motion";
import { toast } from "@rox/ui/sonner";
import {
	createFileRoute,
	Navigate,
	Outlet,
	useLocation,
	useNavigate,
} from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState } from "react";
import { createChatServiceIpcClient } from "renderer/components/Chat/utils/chat-service-client";
import { track } from "renderer/lib/analytics";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { logger } from "renderer/lib/logger";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { OnboardingNavigation } from "./components/OnboardingNavigation";
import { completeActivationStep } from "./onboarding-progress";

export const Route = createFileRoute("/_authenticated/onboarding")({
	component: OnboardingFlowLayout,
	validateSearch: (search: Record<string, unknown>): { rerun?: boolean } => ({
		rerun: search.rerun === true ? true : undefined,
	}),
});

const STEPS = [
	{
		path: "/onboarding",
		match: (p: string) => p === "/onboarding",
		title: "Подключите агента",
		subtitle:
			"Rox должен уметь выполнять действия, а не только показывать интерфейс.",
	},
	{
		path: "/onboarding/project",
		match: (p: string) => p === "/onboarding/project",
		title: "Покажите Rox проект",
		subtitle:
			"Откройте repo или создайте безопасный тестовый проект для обучения.",
	},
	{
		path: "/onboarding/workspace",
		match: (p: string) => p === "/onboarding/workspace",
		title: "Создайте первый workspace",
		subtitle:
			"Workspace связывает задачу, ветку, терминал, чат, изменения и PR.",
	},
	{
		path: "/onboarding/first-agent-action",
		match: (p: string) => p === "/onboarding/first-agent-action",
		title: "Получите первый ответ агента",
		subtitle: "Попросите Rox прочитать проект и вернуть короткий план.",
	},
] as const;

function OnboardingFlowLayout() {
	const { data: session, isPending } = authClient.useSession();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === undefined || platform === "darwin";
	const chatClient = useMemo(() => createChatServiceIpcClient(), []);
	const location = useLocation();
	const navigate = useNavigate();
	const [skipping, setSkipping] = useState(false);
	const { rerun } = Route.useSearch();
	const shouldAnimate = useShouldAnimate("essential");

	if (isPending) return null;
	// Already-onboarded users are redirected out — unless they explicitly
	// relaunched the flow from Settings (?rerun=true).
	if (session?.user?.onboardedAt && !rerun) {
		return <Navigate to="/" replace />;
	}

	const currentStepIdx = STEPS.findIndex((s) => s.match(location.pathname));
	const isOnMainStep = currentStepIdx >= 0;
	const isFirstStep = currentStepIdx === 0;
	const currentStep = isOnMainStep ? STEPS[currentStepIdx] : null;

	const handleBack = () => {
		if (currentStepIdx <= 0) return;
		const target = STEPS[currentStepIdx - 1];
		if (!target) return;
		navigate({ to: target.path });
	};

	const handleContinue = isFirstStep
		? async () => {
				setSkipping(true);
				try {
					await completeActivationStep("provider");
				} catch (error) {
					logger.error("[onboarding] provider progress failed", error);
					toast.error("Не удалось сохранить шаг. Попробуйте ещё раз.");
					setSkipping(false);
					return;
				}
				setSkipping(false);
				await navigate({ to: "/onboarding/project" });
			}
		: null;

	const handleSkip = async () => {
		setSkipping(true);
		track("onboarding_provider_skipped", { outcome: "limited" });
		try {
			await completeActivationStep("provider", {
				providerSkippedAt: new Date().toISOString(),
			});
		} catch (error) {
			logger.error("[onboarding] provider skip failed", error);
			toast.error("Не удалось сохранить ограничение. Попробуйте ещё раз.");
			setSkipping(false);
			return;
		}
		setSkipping(false);
		await navigate({ to: "/onboarding/project" });
	};

	return (
		<ChatServiceProvider client={chatClient} queryClient={electronQueryClient}>
			<div className="flex h-full w-full flex-col bg-background">
				<div
					className="drag h-12 w-full shrink-0"
					style={{ paddingLeft: isMac ? "88px" : "16px" }}
				/>
				<div className="flex-1 overflow-auto">
					{currentStep ? (
						<div className="mx-auto flex w-full max-w-2xl flex-col px-8 pt-16 pb-6">
							<AnimatePresence mode="wait" initial={false}>
								<motion.div
									key={currentStepIdx}
									className="flex flex-col gap-10"
									initial={shouldAnimate ? { opacity: 0, y: 8 } : false}
									animate={{ opacity: 1, y: 0 }}
									exit={shouldAnimate ? { opacity: 0, y: -8 } : undefined}
									transition={{ duration: motionDuration.fast }}
								>
									<div className="space-y-2">
										<h1 className="text-2xl font-semibold text-foreground">
											{currentStep.title}
										</h1>
										<p className="text-sm text-muted-foreground">
											{currentStep.subtitle}
										</p>
									</div>
									<Outlet />
								</motion.div>
							</AnimatePresence>
						</div>
					) : (
						<Outlet />
					)}
				</div>
				{isOnMainStep && (
					<OnboardingNavigation
						currentStep={currentStepIdx}
						totalSteps={STEPS.length}
						onBack={isFirstStep ? null : handleBack}
						onContinue={handleContinue}
						onSkip={handleSkip}
						skipDisabled={skipping}
						continueLabel="Продолжить"
					/>
				)}
			</div>
		</ChatServiceProvider>
	);
}
