export const ACTIVATION_STEPS = [
	"sign_in",
	"organization",
	"provider",
	"project",
	"workspace",
	"first_agent_action",
] as const;

export type ActivationStep = (typeof ACTIVATION_STEPS)[number];

export const REQUIRED_SURFACE_TOURS = [
	"workspaces",
	"workspace",
	"quick_chat",
	"tasks_pr",
	"automations",
	"pipelines",
	"skills_library",
	"memory",
	"settings",
] as const;

export type SurfaceTourId = (typeof REQUIRED_SURFACE_TOURS)[number];

export type ActivationProgress = {
	completedAt: string | null;
	currentStep: ActivationStep;
	completedSteps: Partial<Record<ActivationStep, string>>;
	projectId?: string | null;
	workspaceId?: string | null;
	providerSkippedAt?: string | null;
};

export type SurfaceToursProgress = {
	activeTourId: SurfaceTourId | null;
	activeStepId: string | null;
	pausedAt: string | null;
	completedSteps: Partial<Record<SurfaceTourId, Record<string, string>>>;
	completedTours: Partial<Record<SurfaceTourId, string>>;
	dismissedTours: Partial<Record<SurfaceTourId, string>>;
	lastRoute?: string | null;
};

export type OnboardingStatus = {
	activation: ActivationProgress;
	tours: SurfaceToursProgress;
};

export const DEFAULT_ONBOARDING_STATUS: OnboardingStatus = {
	activation: {
		completedAt: null,
		currentStep: "sign_in",
		completedSteps: {},
		projectId: null,
		workspaceId: null,
		providerSkippedAt: null,
	},
	tours: {
		activeTourId: null,
		activeStepId: null,
		pausedAt: null,
		completedSteps: {},
		completedTours: {},
		dismissedTours: {},
		lastRoute: null,
	},
};

export function normalizeOnboardingStatus(
	value: Partial<OnboardingStatus> | null | undefined,
): OnboardingStatus {
	return {
		activation: {
			...DEFAULT_ONBOARDING_STATUS.activation,
			...(value?.activation ?? {}),
			completedSteps: value?.activation?.completedSteps ?? {},
		},
		tours: {
			...DEFAULT_ONBOARDING_STATUS.tours,
			...(value?.tours ?? {}),
			completedSteps: value?.tours?.completedSteps ?? {},
			completedTours: value?.tours?.completedTours ?? {},
			dismissedTours: value?.tours?.dismissedTours ?? {},
		},
	};
}

export function getOnboardingPercentComplete(status: OnboardingStatus): number {
	const activationDone = status.activation.completedAt
		? ACTIVATION_STEPS.length
		: 0;
	const completedTours = REQUIRED_SURFACE_TOURS.filter(
		(tourId) => status.tours.completedTours[tourId],
	).length;
	const done = activationDone + completedTours;
	const total = ACTIVATION_STEPS.length + REQUIRED_SURFACE_TOURS.length;
	return Math.round((done / total) * 100);
}
