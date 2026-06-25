import type { ActivationStep } from "@rox/shared/onboarding";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

const ACTIVATION_DRAFT_STORAGE_KEY = "rox:onboarding:activation-draft";

interface ActivationDraft {
	projectId?: string | null;
	workspaceId?: string | null;
}

function readActivationDraft(): ActivationDraft {
	try {
		const raw = localStorage.getItem(ACTIVATION_DRAFT_STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as ActivationDraft;
		return {
			projectId:
				typeof parsed.projectId === "string" ? parsed.projectId : undefined,
			workspaceId:
				typeof parsed.workspaceId === "string" ? parsed.workspaceId : undefined,
		};
	} catch {
		return {};
	}
}

function writeActivationDraft(patch: ActivationDraft) {
	try {
		const next = { ...readActivationDraft(), ...patch };
		localStorage.setItem(ACTIVATION_DRAFT_STORAGE_KEY, JSON.stringify(next));
	} catch {}
}

export function getActivationDraft(): ActivationDraft {
	return readActivationDraft();
}

export function rememberActivationWorkspace(workspaceId: string | null) {
	writeActivationDraft({ workspaceId });
}

export async function recordActivationCurrentStep(
	step: ActivationStep,
	extras: {
		projectId?: string | null;
		workspaceId?: string | null;
		providerSkippedAt?: string | null;
	} = {},
) {
	writeActivationDraft({
		projectId: extras.projectId,
		workspaceId: extras.workspaceId,
	});
	await apiTrpcClient.user.updateOnboardingProgress.mutate({
		activation: {
			currentStep: step,
			...extras,
		},
	});
}

export async function completeActivationStep(
	step: ActivationStep,
	extras: {
		projectId?: string | null;
		workspaceId?: string | null;
		providerSkippedAt?: string | null;
	} = {},
) {
	const now = new Date().toISOString();
	writeActivationDraft({
		projectId: extras.projectId,
		workspaceId: extras.workspaceId,
	});
	await apiTrpcClient.user.updateOnboardingProgress.mutate({
		activation: {
			currentStep: step,
			completedSteps: { [step]: now },
			...extras,
		},
	});
}
