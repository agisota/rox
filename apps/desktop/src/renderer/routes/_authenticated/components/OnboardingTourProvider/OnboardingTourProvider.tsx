import { useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useOnboardingTourStore } from "renderer/stores/onboarding-tour";
import {
	OnboardingOverlay,
	type OnboardingOverlayStep,
} from "./components/OnboardingOverlay";
import { OnboardingResumeButton } from "./components/OnboardingResumeButton";

interface OnboardingTourStep extends OnboardingOverlayStep {
	tourId: string;
}

interface OnboardingTourProviderProps {
	children: ReactNode;
}

const FALLBACK_TOUR_STEPS: OnboardingTourStep[] = [
	{
		tourId: "workspace-basics",
		id: "workspaces-list",
		anchor: "nav-workspaces",
		title: "Рабочие пространства",
		body: "Здесь начинается работа с проектами, сессиями и задачами Rox.",
		action: "Откройте список рабочих пространств или создайте новое.",
	},
	{
		tourId: "workspace-basics",
		id: "quick-chat",
		anchor: "nav-quick-chat",
		title: "Быстрый чат",
		body: "Быстрый чат помогает задать вопрос без переключения контекста.",
		action: "Откройте чат и задайте короткий вопрос по текущему проекту.",
	},
	{
		tourId: "workspace-basics",
		id: "tasks-pr",
		anchor: "nav-tasks-pr",
		title: "Задачи и PR",
		body: "Этот раздел связывает работу агента с проверяемым результатом.",
		action: "Посмотрите задачи, изменения и будущий pull request.",
	},
	{
		tourId: "workspace-basics",
		id: "settings",
		anchor: "nav-settings",
		title: "Настройки",
		body: "Проверьте модели, интеграции и параметры рабочего окружения.",
		action: "Откройте настройки, если нужно сменить модель или подключение.",
	},
];

const FALLBACK_TOUR_STORAGE_KEY = "rox-onboarding-tour-fallback-started-v1";

function findStep(tourId: string | null, stepId: string | null) {
	if (!tourId || !stepId) {
		return null;
	}

	return (
		FALLBACK_TOUR_STEPS.find(
			(step) => step.tourId === tourId && step.id === stepId,
		) ?? null
	);
}

function getStepPercent(stepIndex: number) {
	return Math.round(((stepIndex + 1) / FALLBACK_TOUR_STEPS.length) * 100);
}

export function OnboardingTourProvider({
	children,
}: OnboardingTourProviderProps) {
	const location = useLocation();
	const activeTourId = useOnboardingTourStore((state) => state.activeTourId);
	const activeStepId = useOnboardingTourStore((state) => state.activeStepId);
	const pausedAt = useOnboardingTourStore((state) => state.pausedAt);
	const setActiveStep = useOnboardingTourStore((state) => state.setActiveStep);
	const pause = useOnboardingTourStore((state) => state.pause);
	const resume = useOnboardingTourStore((state) => state.resume);
	const clear = useOnboardingTourStore((state) => state.clear);
	const [hasAvailableTarget, setHasAvailableTarget] = useState(true);

	useEffect(() => {
		if (activeTourId || activeStepId || typeof window === "undefined") {
			return;
		}

		if (window.localStorage.getItem(FALLBACK_TOUR_STORAGE_KEY)) {
			return;
		}

		const firstStep = FALLBACK_TOUR_STEPS[0];
		if (!firstStep) {
			return;
		}

		window.localStorage.setItem(FALLBACK_TOUR_STORAGE_KEY, "1");
		setActiveStep(firstStep.tourId, firstStep.id, location.pathname);
	}, [activeStepId, activeTourId, location.pathname, setActiveStep]);

	const activeStep = useMemo(
		() => findStep(activeTourId, activeStepId),
		[activeStepId, activeTourId],
	);
	const activeStepIndex = activeStep
		? FALLBACK_TOUR_STEPS.findIndex(
				(step) =>
					step.tourId === activeStep.tourId && step.id === activeStep.id,
			)
		: -1;

	const percent = activeStepIndex >= 0 ? getStepPercent(activeStepIndex) : 0;
	const shouldShowResumeButton =
		activeStep !== null && (pausedAt !== null || !hasAvailableTarget);
	const shouldShowOverlay =
		activeStep !== null && pausedAt === null && hasAvailableTarget;

	const handlePause = useCallback(() => {
		pause(location.pathname);
	}, [location.pathname, pause]);

	const handleResume = useCallback(() => {
		setHasAvailableTarget(true);
		resume();
	}, [resume]);

	const handleNext = useCallback(() => {
		if (activeStepIndex < 0) {
			clear();
			return;
		}

		const nextStep = FALLBACK_TOUR_STEPS[activeStepIndex + 1];
		if (!nextStep) {
			clear();
			return;
		}

		setHasAvailableTarget(true);
		setActiveStep(nextStep.tourId, nextStep.id, location.pathname);
	}, [activeStepIndex, clear, location.pathname, setActiveStep]);

	return (
		<>
			{children}
			{shouldShowOverlay && activeStep ? (
				<OnboardingOverlay
					step={activeStep}
					stepIndex={activeStepIndex}
					totalSteps={FALLBACK_TOUR_STEPS.length}
					onPause={handlePause}
					onNext={handleNext}
					onTargetAvailabilityChange={setHasAvailableTarget}
				/>
			) : null}
			{shouldShowResumeButton ? (
				<OnboardingResumeButton percent={percent} onResume={handleResume} />
			) : null}
		</>
	);
}
