import { ANALYTICS_EVENTS } from "@rox/shared/constants";
import {
	getOnboardingPercentComplete,
	normalizeOnboardingStatus,
	type OnboardingStatus,
	REQUIRED_SURFACE_TOURS,
	type SurfaceTourId,
} from "@rox/shared/onboarding";
import { useLocation } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { trackEvent } from "renderer/lib/analytics";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { logger } from "renderer/lib/logger";
import { useOnboardingTourStore } from "renderer/stores/onboarding-tour";
import {
	OnboardingOverlay,
	type OnboardingOverlayStep,
} from "./components/OnboardingOverlay";
import { OnboardingResumeButton } from "./components/OnboardingResumeButton";
import { ONBOARDING_TOURS } from "./onboardingTourRegistry";

interface TourStepWithContext extends OnboardingOverlayStep {
	tourId: SurfaceTourId;
	surfaceName: string;
	route: string;
}

interface OnboardingTourProviderProps {
	children: ReactNode;
}

const TOUR_STEPS: TourStepWithContext[] = REQUIRED_SURFACE_TOURS.flatMap(
	(tourId) =>
		ONBOARDING_TOURS[tourId].steps.map((step) => ({
			...step,
			tourId,
			surfaceName: ONBOARDING_TOURS[tourId].surfaceName,
		})),
);

function isRouteMatch(pathname: string, route: string) {
	return pathname === route || pathname.startsWith(`${route}/`);
}

function escapeAnchorSelector(anchor: string) {
	if ("CSS" in window && typeof window.CSS.escape === "function") {
		return window.CSS.escape(anchor);
	}

	return anchor.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function isTargetVisible(anchor: string) {
	const targets = Array.from(
		document.querySelectorAll<HTMLElement>(
			`[data-onboarding-anchor="${escapeAnchorSelector(anchor)}"]`,
		),
	);

	return targets.some((target) => {
		const rect = target.getBoundingClientRect();
		return rect.width > 0 && rect.height > 0;
	});
}

function findStep(tourId: SurfaceTourId | null, stepId: string | null) {
	if (!tourId || !stepId) return null;
	return (
		TOUR_STEPS.find((step) => step.tourId === tourId && step.id === stepId) ??
		null
	);
}

function isStepCompleted(status: OnboardingStatus, step: TourStepWithContext) {
	return Boolean(status.tours.completedSteps[step.tourId]?.[step.id]);
}

function isTourCompleted(status: OnboardingStatus, tourId: SurfaceTourId) {
	return Boolean(status.tours.completedTours[tourId]);
}

function hasRemainingTours(status: OnboardingStatus) {
	return REQUIRED_SURFACE_TOURS.some(
		(tourId) => !isTourCompleted(status, tourId),
	);
}

function getStepIndex(step: TourStepWithContext | null) {
	if (!step) return -1;
	return TOUR_STEPS.findIndex(
		(candidate) => candidate.tourId === step.tourId && candidate.id === step.id,
	);
}

function getFirstIncompleteStep(
	status: OnboardingStatus,
	pathname: string,
	preferVisibleTarget: boolean,
) {
	const routeStep = TOUR_STEPS.find(
		(step) =>
			isRouteMatch(pathname, step.route) &&
			!isStepCompleted(status, step) &&
			(!preferVisibleTarget || isTargetVisible(step.anchor)),
	);
	if (routeStep) return routeStep;

	return (
		TOUR_STEPS.find(
			(step) =>
				!isStepCompleted(status, step) &&
				(!preferVisibleTarget || isTargetVisible(step.anchor)),
		) ?? null
	);
}

function markTourIfComplete(
	status: OnboardingStatus,
	tourId: SurfaceTourId,
	completedAt: string,
) {
	const tour = ONBOARDING_TOURS[tourId];
	const completedStepIds = status.tours.completedSteps[tourId] ?? {};
	const allTourStepsCompleted = tour.steps.every(
		(step) => completedStepIds[step.id],
	);
	if (!allTourStepsCompleted) {
		return status;
	}

	return normalizeOnboardingStatus({
		...status,
		tours: {
			...status.tours,
			completedTours: {
				...status.tours.completedTours,
				[tourId]: completedAt,
			},
		},
	});
}

function updateLocalStatus(
	status: OnboardingStatus,
	step: TourStepWithContext,
	completedAt: string,
) {
	return markTourIfComplete(
		normalizeOnboardingStatus({
			...status,
			tours: {
				...status.tours,
				activeTourId: step.tourId,
				activeStepId: step.id,
				pausedAt: null,
				completedSteps: {
					...status.tours.completedSteps,
					[step.tourId]: {
						...(status.tours.completedSteps[step.tourId] ?? {}),
						[step.id]: completedAt,
					},
				},
			},
		}),
		step.tourId,
		completedAt,
	);
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
	const [status, setStatus] = useState<OnboardingStatus | null>(null);
	const [hasAvailableTarget, setHasAvailableTarget] = useState(true);

	useEffect(() => {
		let cancelled = false;

		async function loadProgress() {
			try {
				const progress = await apiTrpcClient.user.onboardingProgress.query();
				if (!cancelled) {
					setStatus(normalizeOnboardingStatus(progress));
				}
			} catch (error) {
				logger.error("[onboarding-tour] progress load failed", error);
				if (!cancelled) {
					setStatus(normalizeOnboardingStatus(null));
				}
			}
		}

		void loadProgress();

		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!status || activeTourId || activeStepId || pausedAt) {
			return;
		}

		const nextStep = getFirstIncompleteStep(status, location.pathname, true);
		if (!nextStep) {
			return;
		}

		setHasAvailableTarget(true);
		setActiveStep(nextStep.tourId, nextStep.id, location.pathname);
		trackEvent(ANALYTICS_EVENTS.ONBOARDING_TOUR_STARTED, {
			surface: nextStep.tourId,
			step_id: nextStep.id,
			route: location.pathname,
		});
	}, [
		activeStepId,
		activeTourId,
		location.pathname,
		pausedAt,
		setActiveStep,
		status,
	]);

	const activeStep = useMemo(
		() => findStep(activeTourId, activeStepId),
		[activeStepId, activeTourId],
	);
	const activeStepIndex = getStepIndex(activeStep);
	const hasRemaining = status ? hasRemainingTours(status) : false;
	const percent = status ? getOnboardingPercentComplete(status) : 0;
	const shouldShowResumeButton =
		hasRemaining &&
		(activeStep === null || pausedAt !== null || !hasAvailableTarget);
	const shouldShowOverlay =
		activeStep !== null && pausedAt === null && hasAvailableTarget;

	const patchServerTours = useCallback(
		async (
			patch: Parameters<
				typeof apiTrpcClient.user.updateOnboardingProgress.mutate
			>[0],
		) => {
			try {
				await apiTrpcClient.user.updateOnboardingProgress.mutate(patch);
			} catch (error) {
				logger.error("[onboarding-tour] progress update failed", error);
			}
		},
		[],
	);

	const handlePause = useCallback(() => {
		if (!activeStep) return;
		const pausedAtIso = new Date().toISOString();
		pause(location.pathname);
		setStatus((current) =>
			current
				? normalizeOnboardingStatus({
						...current,
						tours: {
							...current.tours,
							activeTourId: activeStep.tourId,
							activeStepId: activeStep.id,
							pausedAt: pausedAtIso,
							lastRoute: location.pathname,
						},
					})
				: current,
		);
		void patchServerTours({
			tours: {
				activeTourId: activeStep.tourId,
				activeStepId: activeStep.id,
				pausedAt: pausedAtIso,
				lastRoute: location.pathname,
			},
		});
		trackEvent(ANALYTICS_EVENTS.ONBOARDING_TOUR_PAUSED, {
			surface: activeStep.tourId,
			step_id: activeStep.id,
			route: location.pathname,
		});
	}, [activeStep, location.pathname, patchServerTours, pause]);

	const handleResume = useCallback(() => {
		const nextStep =
			activeStep ??
			(status
				? getFirstIncompleteStep(status, location.pathname, true)
				: null) ??
			(status
				? getFirstIncompleteStep(status, location.pathname, false)
				: null);

		if (!nextStep) {
			clear();
			return;
		}

		setHasAvailableTarget(true);
		resume();
		setActiveStep(nextStep.tourId, nextStep.id, location.pathname);
		void patchServerTours({
			tours: {
				activeTourId: nextStep.tourId,
				activeStepId: nextStep.id,
				pausedAt: null,
				lastRoute: location.pathname,
			},
		});
		trackEvent(ANALYTICS_EVENTS.ONBOARDING_TOUR_RESUMED, {
			surface: nextStep.tourId,
			step_id: nextStep.id,
			route: location.pathname,
		});
	}, [
		activeStep,
		clear,
		location.pathname,
		patchServerTours,
		resume,
		setActiveStep,
		status,
	]);

	const handleNext = useCallback(() => {
		if (!activeStep || !status) {
			clear();
			return;
		}

		const completedAt = new Date().toISOString();
		const nextStatus = updateLocalStatus(status, activeStep, completedAt);
		setStatus(nextStatus);
		trackEvent(ANALYTICS_EVENTS.ONBOARDING_TOUR_STEP_COMPLETED, {
			surface: activeStep.tourId,
			step_id: activeStep.id,
			route: location.pathname,
		});

		if (nextStatus.tours.completedTours[activeStep.tourId]) {
			trackEvent(ANALYTICS_EVENTS.ONBOARDING_TOUR_COMPLETED, {
				surface: activeStep.tourId,
				route: location.pathname,
				completion_source: "overlay_next",
			});
		}

		if (!hasRemainingTours(nextStatus)) {
			trackEvent(ANALYTICS_EVENTS.ONBOARDING_ALL_COMPLETED, {
				completion_source: "overlay_next",
			});
			clear();
		}

		void patchServerTours({
			tours: {
				activeTourId: null,
				activeStepId: null,
				pausedAt: null,
				completedSteps: {
					[activeStep.tourId]: {
						...(nextStatus.tours.completedSteps[activeStep.tourId] ?? {}),
					},
				},
				completedTours: nextStatus.tours.completedTours,
				lastRoute: location.pathname,
			},
		});

		const nextStep =
			getFirstIncompleteStep(nextStatus, location.pathname, true) ??
			getFirstIncompleteStep(nextStatus, location.pathname, false);

		if (!nextStep) {
			clear();
			return;
		}

		setHasAvailableTarget(true);
		setActiveStep(nextStep.tourId, nextStep.id, location.pathname);
	}, [
		activeStep,
		clear,
		location.pathname,
		patchServerTours,
		setActiveStep,
		status,
	]);

	return (
		<>
			{children}
			{shouldShowOverlay && activeStep ? (
				<OnboardingOverlay
					step={activeStep}
					stepIndex={Math.max(activeStepIndex, 0)}
					totalSteps={TOUR_STEPS.length}
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
