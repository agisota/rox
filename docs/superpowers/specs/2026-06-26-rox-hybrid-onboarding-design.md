# Rox Hybrid Onboarding Design

Date: 2026-06-26
Status: Approved design draft for implementation planning
Scope: Rox desktop first-run onboarding and post-activation surface tours

## Current State

Rox already has a first-run gate in the desktop app:

- Unauthenticated users are redirected to `/sign-in`.
- Authenticated users without an active organization are redirected to `/create-organization`.
- Authenticated users with an active organization but without `user.onboardedAt` are redirected to `/onboarding`.
- The existing `/onboarding` flow has two main steps: connect tools/providers, then add or clone a project.
- Completion is recorded through `apiTrpcClient.user.completeOnboarding`, which sets `users.onboarded_at`.
- Analytics currently emits `onboarding_completed` and a few free-form onboarding events such as provider connection.

This proves Rox has the right entry gate, but the gate currently means "the start screen is dismissed", not "the user understands the product". There is no durable per-step tour state, no per-screen progress, no pause/resume model, and no bottom-left affordance to continue onboarding later.

## Target State

Rox should use a hybrid onboarding model:

- The first session is mandatory until the user reaches the first real value moment.
- After activation, the product is usable.
- The rest of onboarding continues as resumable, per-surface walkthroughs.
- The user can pause any walkthrough.
- A bottom-left `Продолжить onboarding` button remains visible until the required surface tours are complete.
- Every major surface teaches through a small real action, not a passive lecture.

The activation moment is:

> The user has opened or created a project, created a workspace, and received the first useful AI response or run result in that workspace.

## Gap / Transformation

The current single `users.onboarded_at` field is too coarse. It should remain for compatibility, but it must become the marker for activation completion, not full onboarding completion.

The system needs two layers of onboarding state:

1. `activation`: the mandatory path from account entry to first value.
2. `surfaceTours`: resumable walkthroughs for the application surfaces after activation.

Implementation should preserve the existing route structure and expand it rather than replacing it wholesale. The existing `/onboarding` path can remain the activation flow, while global surface tours mount inside the authenticated desktop shell after the auth and organization gates.

## Activation Flow

### Step 1: Sign In

Purpose: explain why the account is needed.

User-facing copy:

> Войдите, чтобы Rox мог сохранить ваши проекты, workspace и настройки агентов.

User action:

- Sign in with GitHub, Yandex, Telegram, or the development local admin path.

Completion condition:

- `session.user` exists.

### Step 2: Organization

Purpose: explain that Rox groups projects, tasks, memory, and integrations under the active organization.

User-facing copy:

> Организация связывает проекты, задачи, память и интеграции в одно рабочее пространство.

User action:

- Create a new organization or continue with an existing active organization.

Completion condition:

- `session.session.activeOrganizationId` exists.

### Step 3: AI Provider

Purpose: prevent a user from entering the product with no way to get agent value.

User-facing copy:

> Подключите хотя бы одного агента, чтобы Rox мог выполнять действия, а не только показывать интерфейс.

User action:

- Connect Claude Code or Codex through OAuth or API key.

Completion condition:

- Anthropic status or OpenAI status is authenticated and has no blocking issue.

Skip behavior:

- Skipping is allowed, but the next step must show a visible limitation message:

> Без провайдера можно открыть проект, но агентские действия будут недоступны.

### Step 4: Project

Purpose: anchor onboarding in a real or safe test project.

User-facing copy:

> Выберите реальный repo или создайте тестовый проект. Onboarding будет показывать функции на этом проекте.

User action:

- Open a local folder.
- Clone a repository URL.
- Create a test/demo project.

Completion condition:

- A `projectId` is selected or created.

### Step 5: First Workspace

Purpose: teach the core Rox mental model.

User-facing copy:

> Workspace это отдельная рабочая сессия по задаче: ветка, терминал, чат, изменения и PR живут вместе.

User action:

- Create a workspace using a suggested prompt:

> Разобраться, что делает проект, и предложить первый маленький улучшенный шаг.

Completion condition:

- A `workspaceId` exists and the user lands in the workspace surface.

### Step 6: First Agent Action

Purpose: deliver the activation moment.

User-facing copy:

> Попросите агента прочитать проект и вернуть короткий план. Это первый момент ценности Rox.

User action:

- Send the suggested prompt or a custom first prompt in the workspace chat.

Completion condition:

- A first AI response, run artifact, or equivalent workspace chat result is created.

Activation completion:

- Set `activation.completedAt`.
- Keep `users.onboarded_at` in sync with `activation.completedAt`.
- Do not mark full onboarding complete.
- Show the bottom-left resume affordance if required surface tours remain.

## Surface Tour Mechanics

Surface tours run after activation. They are soft gates: the screen opens, but the first visit shows an overlay explaining what the screen is for and asks the user to complete one small action.

### Active Overlay

The overlay dims the app, highlights one target element, and renders a guide card near the target. Each card contains:

- Progress: `Шаг N из M`
- Surface name
- Short Russian explanation
- Required or recommended action
- `Отложить`
- `Дальше` or an action-specific CTA

The highlighted target should be a stable anchor, preferably a `data-onboarding-anchor` attribute or a small wrapper component around the target control. The tour registry owns copy and step order so feature components do not accumulate long instructional strings.

### Pause

`Отложить` closes the overlay and saves:

- active tour id
- active step id
- current route
- `pausedAt`

The product remains usable.

### Resume

If required tours remain, the desktop shell shows a compact bottom-left button:

> Продолжить onboarding · 18%

Clicking it resumes the next unfinished step. If the saved step is no longer valid because the route or target disappeared, the system falls back to the first unfinished valid step for that surface.

### Completion

Completing a tour step records the timestamp for that step. Completing all required steps for a surface records the surface completion timestamp. Completing all required surfaces hides the resume button and emits the final all-onboarding-complete event.

## Required Surface Tours

### Workspaces List

Goal: understand that this is the home for projects and work sessions.

Action:

- Create a new workspace or open an existing workspace.

Key anchors:

- `Рабочие пространства`
- `Новое рабочее пространство`
- project/workspace list

### Workspace

Goal: understand that a workspace is task context plus chat, terminal, files, changes, and PR state.

Action:

- Send the first workspace prompt or open the suggested initial chat.

Key anchors:

- workspace sidebar
- chat pane
- terminal pane
- changes or review pane when available

### Quick Chat

Goal: understand that quick chat is for fast questions outside a dedicated workspace.

Action:

- Ask a question about the active project or app state.

Key anchors:

- `Быстрый чат`
- model picker
- input composer

### Tasks and PR

Goal: understand that tasks and PRs connect planning, GitHub work, and agent execution.

Action:

- Create a task, open an existing task, or inspect a PR-related view.

Key anchors:

- `Задачи и PR`
- task creation control
- task board/table
- PR detail link when available

### Automations

Goal: understand that automations run repeatable work from events or schedules.

Action:

- Create a draft automation without enabling it.

Key anchors:

- `Автоматизации`
- create automation action
- trigger area
- action/workflow area

### Pipelines

Goal: understand that pipelines compose multi-step agent workflows.

Action:

- Open a pipeline template and inspect the role or node library.

Key anchors:

- `Пайплайны`
- pipeline template
- role library
- node inspector

### Skills Library

Goal: understand that skills are reusable agent capabilities.

Action:

- Search for a skill and open its details.

Key anchors:

- `Библиотека скиллов`
- search field
- skill card/details panel

### Memory

Goal: understand what Rox stores and how memory helps future work.

Action:

- Open memory search or import a knowledge source.

Key anchors:

- `Память`
- search/import controls
- memory group/details

### Settings

Goal: understand where providers, GitHub CLI, permissions, identity, and appearance are managed.

Action:

- Open one relevant settings section and inspect the current state.

Key anchors:

- `Настройки`
- models/providers
- integrations
- permissions
- account/identity

## State Model

The shared type should look like this conceptually:

```ts
type ActivationStep =
	| "sign_in"
	| "organization"
	| "provider"
	| "project"
	| "workspace"
	| "first_agent_action";

type SurfaceTourId =
	| "workspaces"
	| "workspace"
	| "quick_chat"
	| "tasks_pr"
	| "automations"
	| "pipelines"
	| "skills_library"
	| "memory"
	| "settings";

type OnboardingStatus = {
	activation: {
		completedAt: string | null;
		currentStep: ActivationStep;
		completedSteps: Partial<Record<ActivationStep, string>>;
	};
	tours: {
		activeTourId: SurfaceTourId | null;
		activeStepId: string | null;
		pausedAt: string | null;
		completedTours: Partial<Record<SurfaceTourId, string>>;
		dismissedTours: Partial<Record<SurfaceTourId, string>>;
	};
};
```

Storage split:

- Durable cross-device state: user onboarding progress in the server-backed profile layer.
- Local UI state: exact overlay placement, last route, and transient pause/resume detail in a desktop renderer store.
- Compatibility state: `users.onboarded_at` remains and mirrors `activation.completedAt`.

## Analytics Events

Add canonical typed events:

- `onboarding_activation_started`
- `onboarding_activation_step_completed`
- `onboarding_activation_completed`
- `onboarding_tour_started`
- `onboarding_tour_step_completed`
- `onboarding_tour_paused`
- `onboarding_tour_resumed`
- `onboarding_tour_completed`
- `onboarding_all_completed`

Payload fields:

- `surface`
- `step_id`
- `route`
- `project_id`
- `workspace_id`
- `provider`
- `completion_source`

Existing `onboarding_completed` can remain as the compatibility activation event, but new dashboards should use the more specific events.

## Implementation Boundaries

### Shared Packages

- `packages/shared`: define `ActivationStep`, `SurfaceTourId`, tour ids, and analytics constants.
- `packages/analytics`: add typed payloads for onboarding events.
- `packages/db` and `packages/trpc`: add durable onboarding progress read/update APIs while preserving `onboardedAt`.

### Desktop Renderer

- Expand `apps/desktop/src/renderer/routes/_authenticated/onboarding` into the activation flow.
- Mount a global `OnboardingTourProvider` under `apps/desktop/src/renderer/routes/_authenticated` after auth and organization gates.
- Add a bottom-left `OnboardingResumeButton` in the authenticated shell when required tours remain.
- Add stable tour anchors to dashboard navigation and the target controls on the required surfaces.
- Keep tour copy in a centralized registry rather than scattering long instructional text through feature components.

### Non-Goals For The First Implementation

- Do not block every screen until its tour is complete.
- Do not force existing onboarded users through the activation path again.
- Do not build email onboarding in the first implementation.
- Do not add a new dependency for basic overlays unless existing UI primitives are insufficient.
- Do not store secrets or provider credentials in onboarding state.

## Verification Proof

The implementation is done only when these checks pass:

- Fresh desktop user reaches a first AI result before `activation.completedAt` is set.
- Existing onboarded user is not forced through activation again.
- User can pause an active overlay, navigate elsewhere, restart the app, and resume from the bottom-left button.
- First-use tour appears on each required surface.
- Completing all required surface tours hides the resume button.
- Analytics events are emitted for activation start, activation completion, tour pause, tour resume, tour completion, and all-onboarding completion.
- Error text in onboarding remains selectable where it can contain user-actionable failures.

## Rollout Plan

1. Build the state model and read/update API behind existing auth protection.
2. Add the activation path while keeping `users.onboarded_at` compatibility behavior.
3. Add tour provider and resume button with one surface tour, preferably `Рабочие пространства`.
4. Expand to the remaining required surfaces.
5. Add analytics dashboards or event validation for the new funnel.
6. Keep the old `Повторить запуск` settings entry, but make it restart activation or surface tours explicitly.

## Approved Decisions

- Use `Project-first activation`.
- Use hybrid gating: mandatory first value path, then soft per-surface tours.
- Treat `users.onboarded_at` as activation completion, not full onboarding completion.
- Show `Продолжить onboarding` bottom-left until required surface tours are complete.
- Teach each surface through one small task-based action.
