"use client";

import {
	CONNECT_ONLY_CAPABILITIES,
	canContinue as canContinueNav,
	canGoBack,
	createWizardNavState,
	PROBE_IDLE,
	type ProbeState,
	probeGateSatisfied,
	withStepCopy,
	wizardNavReducer,
} from "@rox/shared/wizard";
import { Button } from "@rox/ui/button";
import { Card } from "@rox/ui/card";
import {
	OnboardingWizardShell,
	ProbeStatusIndicator,
} from "@rox/ui/onboarding-wizard-shell";
import { useReducer, useState } from "react";

/**
 * Web connect-only onboarding host (F48, #637).
 *
 * Consumes the SAME neutral wizard core (`@rox/shared/wizard`) and DOM shell
 * (`@rox/ui/onboarding-wizard-shell`) as desktop, but with
 * {@link CONNECT_ONLY_CAPABILITIES} (`canInstallDeps: false`): the system step
 * shows connect-only provider links instead of the Electron dep installer.
 *
 * Probe path: the web app's tRPC client targets the host API (`@rox/trpc`),
 * which has no OpenAI-compatible `/models` probe procedure — that lives in the
 * desktop chat-service, which the browser cannot reach. So the probe stays in
 * `idle` here; the connect-only requirement is satisfied by the shared shell
 * rendering the same step + status surface. When a web server probe path
 * exists, swap the idle `probe` for a real `runProbe` callback (the neutral
 * `probeReducer`/`ProbeState` contract is already platform-agnostic).
 *
 * Reduced motion is honored automatically: the shared shell + dots gate their
 * framer-motion on `useShouldAnimate`.
 */

const STEPS = withStepCopy({
	system: {
		title: "Подключите провайдеров",
		subtitle: "Войдите в провайдеров агентов, чтобы начать работу в браузере.",
	},
	setup: {
		title: "Проверьте провайдера моделей",
		subtitle: "Проверка моделей доступна в десктоп-приложении Rox.",
		optional: true,
	},
	workspace: {
		title: "Откройте рабочее пространство",
		subtitle: "Выберите или создайте рабочее пространство, чтобы продолжить.",
	},
	finish: {
		title: "Готово к работе",
		subtitle: "Перейдите к рабочим пространствам Rox.",
	},
});

const PROVIDER_DOCS = "https://docs.rox.one/providers";

export default function WebOnboardingPage() {
	const [navState, dispatch] = useReducer(
		wizardNavReducer,
		createWizardNavState(STEPS.length),
	);
	// Connect-only on web: the probe has no server path here, so it stays idle.
	const [probe] = useState<ProbeState>(PROBE_IDLE);

	const { canInstallDeps } = CONNECT_ONLY_CAPABILITIES;
	const currentStep = STEPS[navState.currentIndex];
	const isLastStep = navState.currentIndex === STEPS.length - 1;
	const gateSatisfied =
		currentStep?.id === "setup" ? probeGateSatisfied(probe) : true;

	const finish = () => {
		window.location.assign("/workspaces");
	};

	return (
		<div className="flex h-dvh w-full flex-col bg-background">
			<OnboardingWizardShell
				currentStep={navState.currentIndex}
				totalSteps={STEPS.length}
				title={currentStep?.title ?? ""}
				subtitle={currentStep?.subtitle}
				onBack={canGoBack(navState) ? () => dispatch({ type: "back" }) : null}
				onContinue={
					isLastStep
						? finish
						: canContinueNav(navState, gateSatisfied)
							? () => dispatch({ type: "next" })
							: null
				}
				continueDisabled={
					!isLastStep && !canContinueNav(navState, gateSatisfied)
				}
				onSkip={finish}
				continueLabel={isLastStep ? "Завершить" : "Продолжить"}
			>
				{currentStep?.id === "system" && (
					<Card className="gap-3 p-5">
						<p className="text-sm font-medium text-foreground">
							Провайдеры агентов
						</p>
						<p className="text-xs text-muted-foreground">
							{canInstallDeps
								? "Установите и подключите инструменты."
								: "Откройте документацию, чтобы подключить провайдеров (Claude, Codex и другие)."}
						</p>
						<div>
							<Button
								size="sm"
								variant="outline"
								onClick={() =>
									window.open(PROVIDER_DOCS, "_blank", "noopener,noreferrer")
								}
							>
								Документация провайдеров
							</Button>
						</div>
					</Card>
				)}
				{currentStep?.id === "setup" && (
					<Card className="gap-3 p-5">
						<ProbeStatusIndicator status={probe.status} error={probe.error} />
						<p className="text-xs text-muted-foreground">
							Проверка моделей через /models доступна в десктоп-приложении.
						</p>
					</Card>
				)}
				{currentStep?.id === "workspace" && (
					<Card className="gap-3 p-5">
						<p className="text-sm font-medium text-foreground">
							Рабочее пространство
						</p>
						<p className="text-xs text-muted-foreground">
							Перейдите к рабочим пространствам, чтобы открыть проект.
						</p>
					</Card>
				)}
				{currentStep?.id === "finish" && (
					<Card className="gap-3 p-5">
						<p className="text-sm font-medium text-foreground">Всё готово</p>
						<p className="text-xs text-muted-foreground">
							Нажмите «Завершить», чтобы перейти к рабочим пространствам.
						</p>
					</Card>
				)}
			</OnboardingWizardShell>
		</div>
	);
}
