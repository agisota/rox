# Rox Hybrid Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved Rox hybrid onboarding system: mandatory activation to first value, then resumable Russian surface tours with a bottom-left resume affordance.

**Architecture:** Keep the existing `/onboarding` entry gate, but redefine `users.onboarded_at` as activation completion rather than all onboarding completion. Add a shared typed progress model, server-backed progress mutations, a desktop activation path, and a shell-mounted tour runtime that uses stable `data-onboarding-anchor` targets and centralized Russian copy.

**Tech Stack:** Bun monorepo, TypeScript, React, TanStack Router, tRPC, Drizzle, Zustand persist middleware, existing `@rox/ui` primitives, existing `renderer/lib/analytics`.

---

## Source Inputs

- Approved spec: `docs/superpowers/specs/2026-06-26-rox-hybrid-onboarding-design.md`
- Current first-run gate: `apps/desktop/src/renderer/routes/_authenticated/layout.tsx`
- Current activation pages: `apps/desktop/src/renderer/routes/_authenticated/onboarding/`
- Current user API: `packages/trpc/src/router/user/user.ts`
- Current user schema: `packages/db/src/schema/auth.ts`
- Current analytics catalog: `packages/shared/src/constants.ts`, `packages/analytics/src/events.ts`

Project note: the `writing-plans` skill defaults to `docs/superpowers/plans`, but this repository's `AGENTS.md` requires cross-cutting implementation plans under `plans/`, so this plan lives in `plans/rox-hybrid-onboarding/`.

## Current State

Rox already redirects signed-in users without `session.user.onboardedAt` into `/onboarding`. The current flow has two pages: provider/tool checks and project import/clone. `completeOnboarding` sets only `auth.users.onboarded_at`; there is no typed per-step progress, no pause/resume tour state, no overlay provider, no bottom-left resume control, and no per-surface guided action.

## Target State

Fresh users must finish activation only after project, workspace, and first agent result are known. Existing onboarded users must not be forced through activation again. After activation, global surface tours run as soft, pausable, resumable overlays in Russian. Required tour state is durable enough to survive app restart, and local renderer state keeps route/step placement. Completing all required tours hides the resume affordance.

## Gap / Transformation

Given that the current state is a single `onboardedAt` flag and target state is split activation plus surface tours, implement a typed state model in shared code, persist user onboarding progress through tRPC, change `/onboarding` from "dismiss launch" into "reach first value", mount a shell-level overlay runtime, and add anchors/copy for the required surfaces.

## Lane Ownership

- Lane A, state model/API: shared types, analytics constants, Drizzle schema, user tRPC progress endpoints.
- Lane B, activation flow: desktop `/onboarding` route model, project/workspace/first-agent activation checkpoints, compatibility calls.
- Lane C, overlay provider: renderer store, registry reader, overlay positioning, pause/resume button, shell mount.
- Lane D, surface tours: required surface registry copy, route resolution, stable anchors on dashboard/surface controls.

Each lane must write a receipt in `plans/rox-hybrid-onboarding/receipts/<lane>.md` with changed files, commands run, results, unresolved risks, and integration notes.

## File Structure

Create:

- `packages/shared/src/onboarding/types.ts`: canonical activation/tour ids, status shape, defaults, progress helpers.
- `packages/shared/src/onboarding/index.ts`: barrel export for shared onboarding types/helpers.
- `packages/shared/src/onboarding/types.test.ts`: shared-state normalization tests.
- `apps/desktop/src/renderer/routes/_authenticated/onboarding/onboarding-progress.ts`: activation-step helpers local to the flow.
- `apps/desktop/src/renderer/routes/_authenticated/onboarding/workspace/page.tsx`: first workspace activation step.
- `apps/desktop/src/renderer/routes/_authenticated/onboarding/first-agent-action/page.tsx`: first agent action activation step.
- `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/OnboardingTourProvider.tsx`: shell-level provider.
- `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/index.ts`: provider export.
- `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/onboardingTourRegistry.ts`: centralized Russian tour copy.
- `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/onboardingTourRegistry.test.ts`: registry coverage test.
- `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/components/OnboardingOverlay/OnboardingOverlay.tsx`: dim/highlight/card runtime.
- `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/components/OnboardingOverlay/index.ts`: overlay export.
- `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/components/OnboardingResumeButton/OnboardingResumeButton.tsx`: bottom-left resume button.
- `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/components/OnboardingResumeButton/index.ts`: resume button export.
- `apps/desktop/src/renderer/stores/onboarding-tour/index.ts`: store export.
- `apps/desktop/src/renderer/stores/onboarding-tour/store.ts`: persisted local tour UI state.
- `apps/desktop/src/renderer/stores/onboarding-tour/store.test.ts`: pause/resume/recovery tests.

Modify:

- `packages/shared/src/constants.ts`: add canonical onboarding analytics events.
- `packages/shared/src/index.ts`: export onboarding module if this package uses root exports.
- `packages/analytics/src/events.ts`: add typed payloads for new onboarding events.
- `packages/db/src/schema/auth.ts`: add JSONB onboarding progress column or equivalent user-profile progress field.
- `packages/trpc/src/router/user/user.ts`: add `getOnboardingProgress`, `updateOnboardingProgress`, `completeActivation`, preserve `completeOnboarding`.
- `packages/auth/src/server.ts`: keep `onboardedAt` in session; do not require full tour completion for auth gate.
- `apps/desktop/src/renderer/routeTree.gen.ts`: regenerate through existing router tooling if routes require it.
- `apps/desktop/src/renderer/routes/_authenticated/layout.tsx`: mount `OnboardingTourProvider` after auth/org/activation gates.
- `apps/desktop/src/renderer/routes/_authenticated/onboarding/layout.tsx`: expand activation step list and navigation.
- `apps/desktop/src/renderer/routes/_authenticated/onboarding/page.tsx`: provider step now records activation progress and limitation state.
- `apps/desktop/src/renderer/routes/_authenticated/onboarding/project/page.tsx`: project step records `projectId`, then routes to workspace step instead of completing activation.
- `apps/desktop/src/renderer/routes/_authenticated/settings/experimental/components/ExperimentalSettings/ExperimentalSettings.tsx`: rerun entry chooses activation or surface tours explicitly.
- `apps/desktop/src/renderer/lib/persistent-hash-history/persistent-hash-history.ts`: include new onboarding routes.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarHeader/DashboardSidebarHeader.tsx`: add stable anchors for key nav actions.
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/DashboardSidebar.tsx`: add anchors for memory/settings and lower sidebar surfaces.
- Target surface pages under `apps/desktop/src/renderer/routes/_authenticated/_dashboard/*/page.tsx`: add first-use anchors for controls already present.

Do not modify generated Drizzle migrations manually. If a migration is needed, change schema only and leave generation as a separate verified step unless a safe offline generate is run.

## Receipts Contract

Every lane receipt must use this format:

```md
# <Lane Name> Receipt

Status: DONE | DONE_WITH_CONCERNS | BLOCKED
Worktree: <absolute path>
Branch: <branch>

Changed:
- `<path>`: <what changed>

Verified:
- `<command>`: <result>

Integration notes:
- <required merge order, conflicts, assumptions>

Risks / gaps:
- <none known or exact gap>
```

## Task 1: Shared State Model And Analytics Catalog

**Files:**
- Create: `packages/shared/src/onboarding/types.ts`
- Create: `packages/shared/src/onboarding/index.ts`
- Create: `packages/shared/src/onboarding/types.test.ts`
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/analytics/src/events.ts`
- Receipt: `plans/rox-hybrid-onboarding/receipts/state-model.md`

- [ ] **Step 1: Add shared onboarding ids and status shape**

Create `packages/shared/src/onboarding/types.ts` with:

```ts
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
	"tasks_pr",
	"automations",
	"pipelines",
	"skills_library",
	"memory",
	"settings",
] as const;

export type SurfaceTourId = (typeof REQUIRED_SURFACE_TOURS)[number];

export interface ActivationProgress {
	completedAt: string | null;
	currentStep: ActivationStep;
	completedSteps: Partial<Record<ActivationStep, string>>;
	projectId?: string | null;
	workspaceId?: string | null;
	providerSkippedAt?: string | null;
}

export interface SurfaceToursProgress {
	activeTourId: SurfaceTourId | null;
	activeStepId: string | null;
	pausedAt: string | null;
	completedSteps: Partial<Record<SurfaceTourId, Record<string, string>>>;
	completedTours: Partial<Record<SurfaceTourId, string>>;
	dismissedTours: Partial<Record<SurfaceTourId, string>>;
	lastRoute?: string | null;
}

export interface OnboardingStatus {
	activation: ActivationProgress;
	tours: SurfaceToursProgress;
}

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
	const activationDone = status.activation.completedAt ? ACTIVATION_STEPS.length : 0;
	const completedTours = REQUIRED_SURFACE_TOURS.filter(
		(tourId) => status.tours.completedTours[tourId],
	).length;
	const done = activationDone + completedTours;
	const total = ACTIVATION_STEPS.length + REQUIRED_SURFACE_TOURS.length;
	return Math.round((done / total) * 100);
}
```

- [ ] **Step 2: Export the shared module**

Create `packages/shared/src/onboarding/index.ts`:

```ts
export * from "./types";
```

If `packages/shared/src/index.ts` exists and exports feature modules, add:

```ts
export * from "./onboarding";
```

- [ ] **Step 3: Add tests for normalization and percent**

Create `packages/shared/src/onboarding/types.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
	DEFAULT_ONBOARDING_STATUS,
	getOnboardingPercentComplete,
	normalizeOnboardingStatus,
} from "./types";

describe("onboarding shared state", () => {
	it("fills missing branches from defaults", () => {
		expect(normalizeOnboardingStatus(null)).toEqual(DEFAULT_ONBOARDING_STATUS);
		expect(
			normalizeOnboardingStatus({
				activation: {
					completedAt: null,
					currentStep: "project",
					completedSteps: { provider: "2026-06-26T00:00:00.000Z" },
				},
			}).activation.currentStep,
		).toBe("project");
	});

	it("counts activation and required tours toward resume progress", () => {
		const status = normalizeOnboardingStatus({
			activation: {
				completedAt: "2026-06-26T00:00:00.000Z",
				currentStep: "first_agent_action",
				completedSteps: {},
			},
			tours: {
				activeTourId: null,
				activeStepId: null,
				pausedAt: null,
				completedSteps: {},
				completedTours: { workspaces: "2026-06-26T00:00:00.000Z" },
				dismissedTours: {},
			},
		});
		expect(getOnboardingPercentComplete(status)).toBeGreaterThan(0);
	});
});
```

- [ ] **Step 4: Add canonical analytics names and payloads**

In `packages/shared/src/constants.ts`, append these keys inside `ANALYTICS_EVENTS`:

```ts
	ONBOARDING_ACTIVATION_STARTED: "onboarding_activation_started",
	ONBOARDING_ACTIVATION_STEP_COMPLETED: "onboarding_activation_step_completed",
	ONBOARDING_ACTIVATION_COMPLETED: "onboarding_activation_completed",
	ONBOARDING_TOUR_STARTED: "onboarding_tour_started",
	ONBOARDING_TOUR_STEP_COMPLETED: "onboarding_tour_step_completed",
	ONBOARDING_TOUR_PAUSED: "onboarding_tour_paused",
	ONBOARDING_TOUR_RESUMED: "onboarding_tour_resumed",
	ONBOARDING_TOUR_COMPLETED: "onboarding_tour_completed",
	ONBOARDING_ALL_COMPLETED: "onboarding_all_completed",
```

In `packages/analytics/src/events.ts`, import the onboarding types and add payloads:

```ts
import type { ActivationStep, SurfaceTourId } from "@rox/shared/onboarding";
```

Then add map entries:

```ts
	[ANALYTICS_EVENTS.ONBOARDING_ACTIVATION_STARTED]: {
		route?: string;
		completion_source?: string;
	};
	[ANALYTICS_EVENTS.ONBOARDING_ACTIVATION_STEP_COMPLETED]: {
		step_id: ActivationStep;
		route?: string;
		project_id?: string;
		workspace_id?: string;
		provider?: string;
	};
	[ANALYTICS_EVENTS.ONBOARDING_ACTIVATION_COMPLETED]: {
		project_id?: string;
		workspace_id?: string;
		completion_source?: string;
	};
	[ANALYTICS_EVENTS.ONBOARDING_TOUR_STARTED]: {
		surface: SurfaceTourId;
		step_id?: string;
		route?: string;
	};
	[ANALYTICS_EVENTS.ONBOARDING_TOUR_STEP_COMPLETED]: {
		surface: SurfaceTourId;
		step_id: string;
		route?: string;
	};
	[ANALYTICS_EVENTS.ONBOARDING_TOUR_PAUSED]: {
		surface: SurfaceTourId;
		step_id: string;
		route?: string;
	};
	[ANALYTICS_EVENTS.ONBOARDING_TOUR_RESUMED]: {
		surface: SurfaceTourId;
		step_id?: string;
		route?: string;
	};
	[ANALYTICS_EVENTS.ONBOARDING_TOUR_COMPLETED]: {
		surface: SurfaceTourId;
		route?: string;
		completion_source?: string;
	};
	[ANALYTICS_EVENTS.ONBOARDING_ALL_COMPLETED]: {
		completion_source?: string;
	};
```

- [ ] **Step 5: Verify Task 1**

Run:

```bash
bun test packages/shared/src/onboarding/types.test.ts
```

Expected: tests pass.

Write `plans/rox-hybrid-onboarding/receipts/state-model.md`.

## Task 2: Server Progress Persistence And Compatibility Completion

**Files:**
- Modify: `packages/db/src/schema/auth.ts`
- Modify: `packages/trpc/src/router/user/user.ts`
- Modify: `packages/auth/src/server.ts` only if session typing requires it
- Test: `packages/trpc/src/router/user/user.onboarding.test.ts` if this package has router tests available; otherwise use typecheck as first proof
- Receipt: `plans/rox-hybrid-onboarding/receipts/server-progress.md`

- [ ] **Step 1: Add server-backed progress field**

In `packages/db/src/schema/auth.ts`, add to the `users` table:

```ts
onboardingProgress: jsonb("onboarding_progress").$type<OnboardingStatus>(),
```

Import the type at the top:

```ts
import type { OnboardingStatus } from "@rox/shared/onboarding";
```

Do not edit `packages/db/drizzle/*` manually.

- [ ] **Step 2: Add zod input schemas in the user router**

In `packages/trpc/src/router/user/user.ts`, import shared defaults:

```ts
import {
	ACTIVATION_STEPS,
	DEFAULT_ONBOARDING_STATUS,
	REQUIRED_SURFACE_TOURS,
	normalizeOnboardingStatus,
	type ActivationStep,
	type OnboardingStatus,
	type SurfaceTourId,
} from "@rox/shared/onboarding";
```

Add zod enums:

```ts
const activationStepSchema = z.enum(ACTIVATION_STEPS);
const surfaceTourIdSchema = z.enum(REQUIRED_SURFACE_TOURS);

const onboardingProgressPatchSchema = z.object({
	activation: z
		.object({
			completedAt: z.string().datetime().nullable().optional(),
			currentStep: activationStepSchema.optional(),
			completedSteps: z.record(activationStepSchema, z.string().datetime()).optional(),
			projectId: z.string().nullable().optional(),
			workspaceId: z.string().nullable().optional(),
			providerSkippedAt: z.string().datetime().nullable().optional(),
		})
		.optional(),
	tours: z
		.object({
			activeTourId: surfaceTourIdSchema.nullable().optional(),
			activeStepId: z.string().nullable().optional(),
			pausedAt: z.string().datetime().nullable().optional(),
			completedSteps: z
				.record(surfaceTourIdSchema, z.record(z.string(), z.string().datetime()))
				.optional(),
			completedTours: z.record(surfaceTourIdSchema, z.string().datetime()).optional(),
			dismissedTours: z.record(surfaceTourIdSchema, z.string().datetime()).optional(),
			lastRoute: z.string().nullable().optional(),
		})
		.optional(),
});
```

- [ ] **Step 3: Add merge helper next to the router**

Add:

```ts
function mergeOnboardingStatus(
	current: OnboardingStatus | null | undefined,
	patch: z.infer<typeof onboardingProgressPatchSchema>,
): OnboardingStatus {
	const normalized = normalizeOnboardingStatus(current);
	return normalizeOnboardingStatus({
		activation: {
			...normalized.activation,
			...(patch.activation ?? {}),
			completedSteps: {
				...normalized.activation.completedSteps,
				...(patch.activation?.completedSteps ?? {}),
			},
		},
		tours: {
			...normalized.tours,
			...(patch.tours ?? {}),
			completedSteps: {
				...normalized.tours.completedSteps,
				...(patch.tours?.completedSteps ?? {}),
			},
			completedTours: {
				...normalized.tours.completedTours,
				...(patch.tours?.completedTours ?? {}),
			},
			dismissedTours: {
				...normalized.tours.dismissedTours,
				...(patch.tours?.dismissedTours ?? {}),
			},
		},
	});
}
```

- [ ] **Step 4: Add read/update/completeActivation endpoints**

Add to `userRouter`:

```ts
	onboardingProgress: protectedProcedure.query(async ({ ctx }) => {
		const user = await db.query.users.findFirst({
			where: eq(users.id, ctx.session.user.id),
			columns: {
				onboardedAt: true,
				onboardingProgress: true,
			},
		});
		const progress = normalizeOnboardingStatus(user?.onboardingProgress);
		if (user?.onboardedAt && !progress.activation.completedAt) {
			progress.activation.completedAt = user.onboardedAt.toISOString();
			progress.activation.currentStep = "first_agent_action";
		}
		return progress;
	}),

	updateOnboardingProgress: protectedProcedure
		.input(onboardingProgressPatchSchema)
		.mutation(async ({ ctx, input }) => {
			const user = await db.query.users.findFirst({
				where: eq(users.id, ctx.session.user.id),
				columns: {
					onboardingProgress: true,
				},
			});
			const next = mergeOnboardingStatus(user?.onboardingProgress, input);
			const [updatedUser] = await db
				.update(users)
				.set({ onboardingProgress: next })
				.where(eq(users.id, ctx.session.user.id))
				.returning();
			return normalizeOnboardingStatus(updatedUser.onboardingProgress);
		}),

	completeActivation: protectedProcedure
		.input(
			z.object({
				projectId: z.string().optional(),
				workspaceId: z.string().optional(),
				completionSource: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const completedAt = new Date();
			const completedAtIso = completedAt.toISOString();
			const user = await db.query.users.findFirst({
				where: eq(users.id, ctx.session.user.id),
				columns: {
					onboardingProgress: true,
				},
			});
			const next = mergeOnboardingStatus(user?.onboardingProgress, {
				activation: {
					completedAt: completedAtIso,
					currentStep: "first_agent_action",
					completedSteps: {
						first_agent_action: completedAtIso,
					},
					projectId: input.projectId ?? null,
					workspaceId: input.workspaceId ?? null,
				},
			});
			const [updatedUser] = await db
				.update(users)
				.set({ onboardedAt: completedAt, onboardingProgress: next })
				.where(eq(users.id, ctx.session.user.id))
				.returning();
			return updatedUser;
		}),
```

Update `completeOnboarding` to call the same compatibility behavior, preserving existing callers:

```ts
completeOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
	const completedAt = new Date();
	const completedAtIso = completedAt.toISOString();
	const user = await db.query.users.findFirst({
		where: eq(users.id, ctx.session.user.id),
		columns: { onboardingProgress: true },
	});
	const next = mergeOnboardingStatus(user?.onboardingProgress, {
		activation: {
			completedAt: completedAtIso,
			currentStep: "first_agent_action",
			completedSteps: { first_agent_action: completedAtIso },
		},
	});
	const [updatedUser] = await db
		.update(users)
		.set({ onboardedAt: completedAt, onboardingProgress: next })
		.where(eq(users.id, ctx.session.user.id))
		.returning();
	return updatedUser;
}),
```

- [ ] **Step 5: Verify Task 2**

Run:

```bash
bun run typecheck --filter=@rox/trpc
```

If package filtering is unsupported in this repo script, run:

```bash
bun run typecheck
```

Write `plans/rox-hybrid-onboarding/receipts/server-progress.md`.

## Task 3: Activation Flow

**Files:**
- Modify: `apps/desktop/src/renderer/routes/_authenticated/onboarding/layout.tsx`
- Modify: `apps/desktop/src/renderer/routes/_authenticated/onboarding/page.tsx`
- Modify: `apps/desktop/src/renderer/routes/_authenticated/onboarding/project/page.tsx`
- Create: `apps/desktop/src/renderer/routes/_authenticated/onboarding/onboarding-progress.ts`
- Create: `apps/desktop/src/renderer/routes/_authenticated/onboarding/workspace/page.tsx`
- Create: `apps/desktop/src/renderer/routes/_authenticated/onboarding/first-agent-action/page.tsx`
- Modify: `apps/desktop/src/renderer/lib/persistent-hash-history/persistent-hash-history.ts`
- Receipt: `plans/rox-hybrid-onboarding/receipts/activation-flow.md`

- [ ] **Step 1: Add route-local progress helper**

Create `onboarding-progress.ts`:

```ts
import type { ActivationStep } from "@rox/shared/onboarding";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";

export async function completeActivationStep(
	step: ActivationStep,
	extras: {
		projectId?: string | null;
		workspaceId?: string | null;
		providerSkippedAt?: string | null;
	} = {},
) {
	const now = new Date().toISOString();
	await apiTrpcClient.user.updateOnboardingProgress.mutate({
		activation: {
			currentStep: step,
			completedSteps: { [step]: now },
			...extras,
		},
	});
}
```

- [ ] **Step 2: Expand the activation step list**

In `layout.tsx`, replace `STEPS` with six conceptual steps:

```ts
const STEPS = [
	{ path: "/onboarding", match: (p: string) => p === "/onboarding", title: "Подключите агента", subtitle: "Rox должен уметь выполнять действия, а не только показывать интерфейс." },
	{ path: "/onboarding/project", match: (p: string) => p === "/onboarding/project", title: "Покажите Rox проект", subtitle: "Откройте repo или создайте безопасный тестовый проект для обучения." },
	{ path: "/onboarding/workspace", match: (p: string) => p === "/onboarding/workspace", title: "Создайте первый workspace", subtitle: "Workspace связывает задачу, ветку, терминал, чат, изменения и PR." },
	{ path: "/onboarding/first-agent-action", match: (p: string) => p === "/onboarding/first-agent-action", title: "Получите первый ответ агента", subtitle: "Попросите Rox прочитать проект и вернуть короткий план." },
] as const;
```

Keep sign-in and organization as gates outside this layout because `_authenticated/layout.tsx` already enforces them.

- [ ] **Step 3: Change skip copy and behavior**

Replace "finish onboarding" language with activation language. `handleSkip` should call `updateOnboardingProgress` with `providerSkippedAt` when skipping from provider step, then navigate to project. It should not call `completeOnboarding` unless the user explicitly exits activation after the first value step.

- [ ] **Step 4: Project step routes to workspace step**

In `project/page.tsx`, change `finish(projectId)` so it records project completion and navigates to `/onboarding/workspace`:

```ts
await completeActivationStep("project", { projectId });
await navigate({ to: "/onboarding/workspace", replace: true });
```

Remove `completeOnboarding` from the project step.

- [ ] **Step 5: Add first workspace step**

Create `workspace/page.tsx` with a small page that opens the existing new workspace modal and advances when a workspace id is known. Use existing `useOpenNewWorkspaceModal` as the first implementation, and include this Russian prompt:

```ts
const SUGGESTED_FIRST_WORKSPACE_PROMPT =
	"Разобраться, что делает проект, и предложить первый маленький улучшенный шаг.";
```

If the modal cannot return a workspace id today, persist `currentStep: "workspace"` and route the user to `/v2-workspaces` with the modal opened. The follow-up hook should complete this step when workspace creation succeeds.

- [ ] **Step 6: Add first agent action step**

Create `first-agent-action/page.tsx` with the suggested prompt:

```ts
const SUGGESTED_FIRST_AGENT_PROMPT =
	"Прочитай проект и верни короткий план: что здесь главное, где начать, какой первый маленький шаг улучшит проект.";
```

When a first chat response/run completion signal is not available in this route, add a clear "Я получил первый ответ" fallback button that calls:

```ts
await apiTrpcClient.user.completeActivation.mutate({
	projectId,
	workspaceId,
	completionSource: "manual_first_agent_confirmation",
});
```

Then refetch session and navigate to `/v2-workspaces`.

- [ ] **Step 7: Verify Task 3**

Run:

```bash
bun run typecheck --filter=@rox/desktop
```

If unsupported, run the repo typecheck and record the result. Write `plans/rox-hybrid-onboarding/receipts/activation-flow.md`.

## Task 4: Overlay Provider, Local Store, Pause/Resume Runtime

**Files:**
- Create: `apps/desktop/src/renderer/stores/onboarding-tour/store.ts`
- Create: `apps/desktop/src/renderer/stores/onboarding-tour/index.ts`
- Create: `apps/desktop/src/renderer/stores/onboarding-tour/store.test.ts`
- Create: `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/OnboardingTourProvider.tsx`
- Create: `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/index.ts`
- Create: `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/components/OnboardingOverlay/OnboardingOverlay.tsx`
- Create: `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/components/OnboardingOverlay/index.ts`
- Create: `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/components/OnboardingResumeButton/OnboardingResumeButton.tsx`
- Create: `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/components/OnboardingResumeButton/index.ts`
- Modify: `apps/desktop/src/renderer/routes/_authenticated/layout.tsx`
- Receipt: `plans/rox-hybrid-onboarding/receipts/overlay-provider.md`

- [ ] **Step 1: Add local persisted tour UI store**

Create `store.ts`:

```ts
import type { SurfaceTourId } from "@rox/shared/onboarding";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

interface OnboardingTourUiState {
	activeTourId: SurfaceTourId | null;
	activeStepId: string | null;
	pausedAt: string | null;
	lastRoute: string | null;
	setActiveStep: (tourId: SurfaceTourId, stepId: string, route: string) => void;
	pause: (route: string) => void;
	resume: () => void;
	clear: () => void;
}

export const useOnboardingTourStore = create<OnboardingTourUiState>()(
	devtools(
		persist(
			(set) => ({
				activeTourId: null,
				activeStepId: null,
				pausedAt: null,
				lastRoute: null,
				setActiveStep: (tourId, stepId, route) =>
					set({ activeTourId: tourId, activeStepId: stepId, lastRoute: route, pausedAt: null }),
				pause: (route) => set({ pausedAt: new Date().toISOString(), lastRoute: route }),
				resume: () => set({ pausedAt: null }),
				clear: () => set({ activeTourId: null, activeStepId: null, pausedAt: null, lastRoute: null }),
			}),
			{ name: "rox-onboarding-tour-v1" },
		),
		{ name: "OnboardingTour" },
	),
);
```

- [ ] **Step 2: Add store tests**

Create `store.test.ts` to verify `setActiveStep`, `pause`, `resume`, and `clear` preserve tour identity and route.

- [ ] **Step 3: Add overlay rendering**

`OnboardingOverlay.tsx` must:

- Find the target with `document.querySelector(`[data-onboarding-anchor="${anchor}"]`)`.
- Render a fixed dark overlay across the viewport.
- Draw a highlighted fixed rectangle around the target bounds.
- Render a compact card with `Шаг N из M`, title, body, action text, `Отложить`, and `Дальше`.
- Recalculate target bounds on resize and scroll.
- Return `null` when the target is missing, letting provider choose fallback.

Use existing `Button` and `Card` from `@rox/ui`; do not add a dependency.

- [ ] **Step 4: Add resume button**

`OnboardingResumeButton.tsx` must render bottom-left:

```tsx
<Button className="fixed bottom-4 left-4 z-50 shadow-lg" onClick={onResume}>
	Продолжить onboarding · {percent}%
</Button>
```

Hide it when no required tours remain.

- [ ] **Step 5: Mount provider in authenticated shell**

In `_authenticated/layout.tsx`, import and mount:

```tsx
<OnboardingTourProvider>
	<Outlet />
	<QuoteLoader />
	...
</OnboardingTourProvider>
```

Mount only after auth, active organization, and activation gates have passed, so sign-in/create-org/activation screens do not receive global surface overlays.

- [ ] **Step 6: Verify Task 4**

Run:

```bash
bun test apps/desktop/src/renderer/stores/onboarding-tour/store.test.ts
bun run typecheck --filter=@rox/desktop
```

Write `plans/rox-hybrid-onboarding/receipts/overlay-provider.md`.

## Task 5: Surface Tour Registry And Anchors

**Files:**
- Create: `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/onboardingTourRegistry.ts`
- Create: `apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/onboardingTourRegistry.test.ts`
- Modify: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarHeader/DashboardSidebarHeader.tsx`
- Modify: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/DashboardSidebar.tsx`
- Modify target surface pages under `apps/desktop/src/renderer/routes/_authenticated/_dashboard/`
- Receipt: `plans/rox-hybrid-onboarding/receipts/surface-tours.md`

- [ ] **Step 1: Add registry types and required copy**

Create registry with this shape:

```ts
import type { SurfaceTourId } from "@rox/shared/onboarding";

export interface OnboardingTourStep {
	id: string;
	anchor: string;
	title: string;
	body: string;
	action: string;
	route: string;
}

export interface OnboardingTourDefinition {
	id: SurfaceTourId;
	surfaceName: string;
	required: boolean;
	steps: OnboardingTourStep[];
}

export const ONBOARDING_TOURS: Record<SurfaceTourId, OnboardingTourDefinition> = {
	workspaces: {
		id: "workspaces",
		surfaceName: "Рабочие пространства",
		required: true,
		steps: [
			{
				id: "open-workspaces",
				anchor: "nav-workspaces",
				title: "Дом ваших рабочих сессий",
				body: "Здесь Rox собирает проекты и workspace. Начинайте отсюда, когда нужно вернуться к работе или создать новую задачу.",
				action: "Откройте список или создайте новый workspace.",
				route: "/v2-workspaces",
			},
		],
	},
	workspace: {
		id: "workspace",
		surfaceName: "Workspace",
		required: true,
		steps: [
			{
				id: "workspace-chat",
				anchor: "workspace-chat",
				title: "Задача, чат и изменения вместе",
				body: "Workspace хранит контекст одной задачи: чат, терминал, файлы, изменения и PR-состояние.",
				action: "Отправьте короткий запрос или откройте существующий чат.",
				route: "/v2-workspace",
			},
		],
	},
	tasks_pr: {
		id: "tasks_pr",
		surfaceName: "Задачи и PR",
		required: true,
		steps: [
			{
				id: "tasks-board",
				anchor: "nav-tasks-pr",
				title: "Планирование связано с GitHub",
				body: "Задачи и PR связывают план, исполнение агентом и проверку результата.",
				action: "Откройте список задач или создайте черновик задачи.",
				route: "/tasks",
			},
		],
	},
	automations: {
		id: "automations",
		surfaceName: "Автоматизации",
		required: true,
		steps: [
			{
				id: "automation-draft",
				anchor: "nav-automations",
				title: "Повторяемая работа без ручного запуска",
				body: "Автоматизации запускают действия по событию или расписанию. Первый шаг безопасен: создать черновик без включения.",
				action: "Откройте автоматизации и создайте черновик.",
				route: "/automations",
			},
		],
	},
	pipelines: {
		id: "pipelines",
		surfaceName: "Пайплайны",
		required: true,
		steps: [
			{
				id: "pipeline-template",
				anchor: "nav-pipelines",
				title: "Сценарии из нескольких агентских шагов",
				body: "Пайплайны собирают роли, узлы и проверки в повторяемую цепочку.",
				action: "Откройте шаблон или библиотеку ролей.",
				route: "/pipelines",
			},
		],
	},
	skills_library: {
		id: "skills_library",
		surfaceName: "Библиотека скиллов",
		required: true,
		steps: [
			{
				id: "skill-search",
				anchor: "nav-skills-library",
				title: "Переиспользуемые способности агентов",
				body: "Скиллы добавляют агентам устойчивые инструкции и рабочие приемы.",
				action: "Найдите skill и откройте карточку.",
				route: "/skills-library",
			},
		],
	},
	memory: {
		id: "memory",
		surfaceName: "Память",
		required: true,
		steps: [
			{
				id: "memory-search",
				anchor: "nav-memory",
				title: "Что Rox запоминает для будущей работы",
				body: "Память помогает агентам не начинать с нуля и видеть прежние решения.",
				action: "Откройте память и попробуйте поиск.",
				route: "/memory",
			},
		],
	},
	settings: {
		id: "settings",
		surfaceName: "Настройки",
		required: true,
		steps: [
			{
				id: "settings-models",
				anchor: "nav-settings",
				title: "Где управлять провайдерами и поведением Rox",
				body: "В настройках находятся провайдеры, GitHub CLI, разрешения, профиль, внешний вид и экспериментальные функции.",
				action: "Откройте настройки и проверьте один раздел.",
				route: "/settings/account",
			},
		],
	},
};
```

- [ ] **Step 2: Registry coverage test**

Create a test that asserts every `REQUIRED_SURFACE_TOURS` id exists, every required tour has at least one step, and every step has non-empty Russian copy plus an anchor.

- [ ] **Step 3: Add stable anchors to navigation**

Add attributes such as:

```tsx
data-onboarding-anchor="nav-workspaces"
data-onboarding-anchor="nav-automations"
data-onboarding-anchor="nav-pipelines"
data-onboarding-anchor="nav-tasks-pr"
data-onboarding-anchor="nav-skills-library"
data-onboarding-anchor="nav-memory"
data-onboarding-anchor="nav-settings"
```

Add them to both collapsed and expanded controls when both variants exist.

- [ ] **Step 4: Add first-use anchors to available surface controls**

Add anchors to existing controls without changing layout:

- `workspace-chat` on the workspace chat pane or composer.
- `tasks-create` on the task creation control if present.
- `automation-create` on automation creation control if present.
- `pipeline-template` on template/role library control if present.
- `skill-search` on skills search field if present.
- `memory-search` on memory search/import area if present.

When a surface does not have the exact control yet, add only the nav anchor and record the missing inner anchor in the receipt.

- [ ] **Step 5: Verify Task 5**

Run:

```bash
bun test apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/onboardingTourRegistry.test.ts
bun run typecheck --filter=@rox/desktop
```

Write `plans/rox-hybrid-onboarding/receipts/surface-tours.md`.

## Task 6: Integration And Verification

**Files:**
- Integrate outputs from lanes A-D into one branch.
- Resolve conflicts in shared files: `layout.tsx`, `constants.ts`, `events.ts`, sidebar components.
- Receipt: `plans/rox-hybrid-onboarding/receipts/integration.md`

- [ ] **Step 1: Merge lane branches in order**

Merge order:

1. State model/API.
2. Overlay provider.
3. Surface tours.
4. Activation flow.

Reason: activation depends on server progress, overlay depends on shared ids, tours depend on overlay registry shape, and activation is the most route-sensitive.

- [ ] **Step 2: Run focused tests**

Run:

```bash
bun test packages/shared/src/onboarding/types.test.ts
bun test apps/desktop/src/renderer/stores/onboarding-tour/store.test.ts
bun test apps/desktop/src/renderer/routes/_authenticated/components/OnboardingTourProvider/onboardingTourRegistry.test.ts
```

- [ ] **Step 3: Run repo checks**

Run:

```bash
bun run typecheck
bun run lint < /dev/null
```

- [ ] **Step 4: Browser/desktop smoke when available**

If a desktop dev session can start, use portless:

```bash
portless rox-onboarding "bun run dev --filter=@rox/desktop"
```

Record screenshots or a clear manual proof for:

- Fresh user enters `/onboarding`.
- Activation does not complete on project selection alone.
- Resume button appears after activation when tours remain.
- `Отложить` hides overlay and `Продолжить onboarding` resumes it.

- [ ] **Step 5: Final receipt**

Write `plans/rox-hybrid-onboarding/receipts/integration.md` with commands, results, and any unverified smoke scenarios.

## Verification Proof

This implementation is done only when:

- Shared state tests pass.
- Store/registry tests pass.
- Typecheck passes or exact unrelated pre-existing failures are documented.
- Lint passes or exact unrelated pre-existing failures are documented.
- Server progress keeps `onboardedAt` compatibility.
- Activation completion is not set at project step.
- Overlay pause/resume state survives reload through Zustand persist.
- Required tours have Russian copy and stable anchors.
- Receipts exist for every lane and integration.

## Remaining Blockers

- Applying production database migrations is explicitly out of scope. Schema changes can be authored, but production migration requires a separate deploy decision.
- Full Electron visual QA may require a working local desktop dev environment and signed-in dev account.
