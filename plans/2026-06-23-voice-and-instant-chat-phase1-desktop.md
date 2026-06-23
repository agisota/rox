# Voice always-on + instant chat (Phase 1 · Desktop) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On desktop, make voice dictation reliably available to every signed-in user (gated by a shared server key, not a broken button), and make creating a project drop the user straight into a chat.

**Architecture:** Two independent blocks. **B (voice always-on):** document the shared server `GROQ_API_KEY`, and gate the existing `MicButton` on the already-present `voice.isConfigured` tRPC query so the button is only active when the service really works. **C (project → chat):** `project.create` already creates a main-workspace and returns `mainWorkspaceId`; navigate into it after creation (only when the caller asked to "open"), and seed an empty chat tab as the default surface of an empty workspace (idempotently, after layout hydration). Pure logic is extracted into small tested functions; UI wiring is verified by typecheck + a manual visual run.

**Tech Stack:** Bun + Turbo monorepo, Electron renderer (React + TanStack Router + TanStack DB live queries), zustand stores, tRPC (`apiClient` = cloud `AppRouter`; `chatServiceTrpc` = desktop chat router), `bun:test` co-located tests, Biome lint.

**Companion spec:** `docs/superpowers/specs/2026-06-23-voice-everywhere-and-instant-chat-design.md`

**Scope note:** This plan is Phase 1 / Desktop only (blocks B + C). The shared voice module extraction (A), web quick-chat (D), and web voice (E) are a separate plan (Phase 1 / Web). Mobile is Phase 3.

**Conventions / gotchas:**
- Branch: create `feat/voice-everywhere-instant-chat` from `main` before starting. Commit steps below assume you are cleared to commit per the repo's standing git policy; if not, stage and pause.
- Run a single test: `bun test <path>`. Typecheck desktop: `bunx turbo typecheck --filter=@rox/desktop`. Lint: `bun run lint < /dev/null` (stdin redirect avoids an `rg` hang in non-interactive shells; CI fails on warnings too — run `bun run lint:fix` after edits).
- New folders follow repo convention: `Name/Name.ts` + co-located `Name.test.ts` + `index.ts` barrel.
- All voice changes touch ONLY the `components/Chat/ChatInterface/...` `ChatInputFooter` tree (the `WorkspaceChatInterface` copy has no mic by design — out of scope).

---

## Task 1: Document the shared `GROQ_API_KEY` in env examples

**Files:**
- Modify: `.env.example` (after the `ANTHROPIC_API_KEY=` line, ~line 77)
- Modify: `.env.local.example` (after the `ANTHROPIC_API_KEY=sk-ant-fake-local-dev` line, ~line 85)

No test (config/doc only). Backend already reads it (`packages/trpc/src/lib/voice/whisper.ts:20`); this only documents the variable.

- [ ] **Step 1: Add the Groq section to `.env.example`**

Insert immediately after the `ANTHROPIC_API_KEY=` line:

```bash
# -----------------------------------------------------------------------------
# Groq (server-side Whisper voice dictation)
# Shared server key — every signed-in user dictates with it. Get a gsk_… key
# from console.groq.com. Optional: without it, voice.isConfigured returns false
# and the dictation mic button stays disabled.
# -----------------------------------------------------------------------------
GROQ_API_KEY=
```

- [ ] **Step 2: Add the Groq section to `.env.local.example`**

Insert immediately after the `ANTHROPIC_API_KEY=sk-ant-fake-local-dev` line:

```bash
# -----------------------------------------------------------------------------
# Groq (server-side Whisper voice dictation — optional for local dev)
# Leave blank: dictation just stays disabled (voice.isConfigured returns false).
# Set a real gsk_… key from console.groq.com to enable local dictation.
# -----------------------------------------------------------------------------
GROQ_API_KEY=
```

- [ ] **Step 3: Commit**

```bash
git add .env.example .env.local.example
git commit -m "docs(env): document shared GROQ_API_KEY for voice dictation"
```

---

## Task 2: Extract `canStartDictation` pure function (TDD)

DRY the duplicated `disabled || transcribing` guard in `MicButton` into one tested function. This is the unit-testable core of block B.

**Files:**
- Create: `apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/MicButton/canStartDictation.ts`
- Test: `apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/MicButton/canStartDictation.test.ts`

- [ ] **Step 1: Write the failing test**

Create `canStartDictation.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { canStartDictation } from "./canStartDictation";

describe("canStartDictation", () => {
	it("allows dictation when enabled and not transcribing", () => {
		expect(canStartDictation(false, false)).toBe(true);
	});

	it("blocks dictation when disabled (e.g. voice not configured)", () => {
		expect(canStartDictation(true, false)).toBe(false);
	});

	it("blocks dictation while a previous clip is transcribing", () => {
		expect(canStartDictation(false, true)).toBe(false);
	});

	it("blocks when both disabled and transcribing", () => {
		expect(canStartDictation(true, true)).toBe(false);
	});

	it("treats undefined props as not-disabled / not-transcribing", () => {
		expect(canStartDictation(undefined, undefined)).toBe(true);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/MicButton/canStartDictation.test.ts`
Expected: FAIL — `Cannot find module './canStartDictation'`.

- [ ] **Step 3: Write the implementation**

Create `canStartDictation.ts`:

```ts
/**
 * Whether the dictation mic may start recording right now.
 * `disabled` folds in "voice not configured"; `transcribing` is the in-flight
 * transcription of the previous clip. Either one blocks a new recording.
 */
export function canStartDictation(
	disabled: boolean | undefined,
	transcribing: boolean | undefined,
): boolean {
	return !disabled && !transcribing;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/MicButton/canStartDictation.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Use it inside `MicButton.tsx` (DRY the duplicated guard)**

In `apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/MicButton/MicButton.tsx`:

Add the import near the other local imports (top of file):

```tsx
import { canStartDictation } from "./canStartDictation";
```

Replace the guard inside `useHotkey("DICTATE", ...)` — change:

```tsx
	useHotkey("DICTATE", () => {
		if (disabled || transcribing) return;
```

to:

```tsx
	useHotkey("DICTATE", () => {
		if (!canStartDictation(disabled, transcribing)) return;
```

Replace the guard at the top of `handlePointerDown` — change:

```tsx
	const handlePointerDown = (e: React.PointerEvent) => {
		if (disabled || transcribing) return;
```

to:

```tsx
	const handlePointerDown = (e: React.PointerEvent) => {
		if (!canStartDictation(disabled, transcribing)) return;
```

- [ ] **Step 6: Typecheck**

Run: `bunx turbo typecheck --filter=@rox/desktop`
Expected: PASS (no type errors).

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/MicButton/
git commit -m "refactor(desktop/voice): extract tested canStartDictation guard"
```

---

## Task 3: Gate the mic button on `voice.isConfigured`

Wire the existing cloud query `voice.isConfigured` (`packages/trpc/src/router/voice/voice.ts:12-15`, returns `{ configured: boolean }`) into the composer, and pass `disabled={!configured}` to `MicButton`. Read it via `@tanstack/react-query`'s `useQuery` calling `apiClient.voice.isConfigured.query()` — the same `apiClient` already used for `voice.transcribe` (server is the source of truth for the shared key).

**Files:**
- Modify: `apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/ChatInputFooter.tsx`
- Modify: `apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/ChatComposerControls/ChatComposerControls.tsx`

UI wiring — verified by typecheck (and the visual run in Task 12). No new unit test (the testable core is Task 2).

- [ ] **Step 1: Add the `voice.isConfigured` query in `ChatInputFooter.tsx`**

Add the import near the existing React import:

```tsx
import { useQuery } from "@tanstack/react-query";
```

Add the query alongside the other hooks (e.g. just before `const trpcUtils = chatServiceTrpc.useUtils();`):

```tsx
	// Server-side Whisper availability. With a shared server GROQ_API_KEY this is
	// always true; the gate just keeps a dead mic button from appearing usable
	// if the key is ever absent. apiClient (cloud AppRouter) is the same client
	// already used for voice.transcribe.
	const { data: voiceConfig } = useQuery({
		queryKey: ["voice", "isConfigured"],
		queryFn: () => apiClient.voice.isConfigured.query(),
		staleTime: Number.POSITIVE_INFINITY,
	});
	const dictationConfigured = voiceConfig?.configured ?? false;
```

- [ ] **Step 2: Pass the flag to `<ChatComposerControls>`**

In the same file, find the `<ChatComposerControls ... />` JSX and add the prop next to the existing `dictationTranscribing={transcribing}`:

```tsx
	onDictationComplete={handleDictationComplete}
	dictationTranscribing={transcribing}
	dictationConfigured={dictationConfigured}
/>
```

- [ ] **Step 3: Accept and apply the prop in `ChatComposerControls.tsx`**

Add to the `ChatComposerControlsProps` interface, after `dictationTranscribing?: boolean;`:

```tsx
	/** Server-side Whisper availability (voice.isConfigured). Off → mic disabled. */
	dictationConfigured?: boolean;
```

Add to the destructured params, after `dictationTranscribing,`:

```tsx
	dictationConfigured,
```

Pass it through to `MicButton` — change:

```tsx
				<MicButton
					onComplete={onDictationComplete}
					transcribing={dictationTranscribing}
				/>
```

to:

```tsx
				<MicButton
					onComplete={onDictationComplete}
					transcribing={dictationTranscribing}
					disabled={!dictationConfigured}
				/>
```

> Decision (recorded): we **disable** (not hide) the button when unconfigured. `MicButton` already renders a disabled state (`opacity-40`, inert gestures/hotkey via Task 2's guard), and keeping the button mounted avoids layout shift and keeps the `DICTATE` hotkey registration stable. With a shared server key, `configured` is effectively always true, so users see a normal, active mic.

- [ ] **Step 4: Typecheck**

Run: `bunx turbo typecheck --filter=@rox/desktop`
Expected: PASS.

- [ ] **Step 5: Lint**

Run: `bun run lint < /dev/null`
Expected: exits 0, no output.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/
git commit -m "feat(desktop/voice): gate mic button on voice.isConfigured"
```

---

## Task 4: `resolveNewProjectIntent` pure function (TDD)

Decide, purely, whether creating a project should navigate into its main-workspace. Navigate only when the caller asked to "open" AND a `mainWorkspaceId` exists.

**Files:**
- Create: `apps/desktop/src/renderer/stores/utils/resolveNewProjectIntent/resolveNewProjectIntent.ts`
- Create: `apps/desktop/src/renderer/stores/utils/resolveNewProjectIntent/index.ts`
- Test: `apps/desktop/src/renderer/stores/utils/resolveNewProjectIntent/resolveNewProjectIntent.test.ts`

- [ ] **Step 1: Write the failing test**

Create `resolveNewProjectIntent.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { resolveNewProjectIntent } from "./resolveNewProjectIntent";

describe("resolveNewProjectIntent", () => {
	it("navigates to the main-workspace when intent is open and id exists", () => {
		expect(resolveNewProjectIntent("open", "ws_123")).toEqual({
			kind: "navigate-workspace",
			workspaceId: "ws_123",
		});
	});

	it("does nothing when intent is open but there is no main-workspace", () => {
		expect(resolveNewProjectIntent("open", null)).toEqual({ kind: "none" });
	});

	it("does nothing when intent is return-id even if an id exists", () => {
		expect(resolveNewProjectIntent("return-id", "ws_123")).toEqual({
			kind: "none",
		});
	});

	it("does nothing for return-id with no id", () => {
		expect(resolveNewProjectIntent("return-id", null)).toEqual({ kind: "none" });
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/desktop/src/renderer/stores/utils/resolveNewProjectIntent/resolveNewProjectIntent.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `resolveNewProjectIntent.ts`:

```ts
import type { NewProjectIntent } from "../../add-repository-modal";

export interface NavigateToWorkspaceCommand {
	kind: "navigate-workspace";
	workspaceId: string;
}

export type NewProjectNavDecision =
	| NavigateToWorkspaceCommand
	| { kind: "none" };

/**
 * Pure post-create decision: navigate into the project's main-workspace ONLY
 * when the caller asked to "open" and a workspace id is known. Otherwise stay.
 */
export function resolveNewProjectIntent(
	intent: NewProjectIntent,
	mainWorkspaceId: string | null | undefined,
): NewProjectNavDecision {
	if (intent === "open" && mainWorkspaceId) {
		return { kind: "navigate-workspace", workspaceId: mainWorkspaceId };
	}
	return { kind: "none" };
}
```

Create `index.ts`:

```ts
export {
	type NavigateToWorkspaceCommand,
	type NewProjectNavDecision,
	resolveNewProjectIntent,
} from "./resolveNewProjectIntent";
```

> Note: `NewProjectIntent` is defined in Task 6 (`add-repository-modal.ts`). Implement Task 6 in the same branch; if you run this test before Task 6 exists, temporarily inline `type NewProjectIntent = "open" | "return-id";` and replace with the import once Task 6 lands. Prefer doing Task 6 first if working strictly sequentially.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test apps/desktop/src/renderer/stores/utils/resolveNewProjectIntent/resolveNewProjectIntent.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/stores/utils/resolveNewProjectIntent/
git commit -m "feat(desktop): add tested resolveNewProjectIntent decision"
```

---

## Task 5: `shouldSeedChat` pure function (TDD)

Decide, purely, whether an opened workspace should auto-open a chat tab: true only when the (hydrated) persisted layout has no tabs.

**Files:**
- Create: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/shouldSeedChat/shouldSeedChat.ts`
- Create: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/shouldSeedChat/index.ts`
- Test: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/shouldSeedChat/shouldSeedChat.test.ts`

- [ ] **Step 1: Write the failing test**

Create `shouldSeedChat.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { shouldSeedChat } from "./shouldSeedChat";

const EMPTY = { version: 1 as const, tabs: [], activeTabId: null };
const WITH_TAB = {
	version: 1 as const,
	tabs: [{ id: "t1", panes: [], activePaneId: null }],
	activeTabId: "t1",
};

describe("shouldSeedChat", () => {
	it("returns false when the layout is not yet known (null)", () => {
		expect(shouldSeedChat(null)).toBe(false);
	});

	it("returns false when the layout is undefined", () => {
		expect(shouldSeedChat(undefined)).toBe(false);
	});

	it("returns true for an empty hydrated layout (no tabs)", () => {
		// biome-ignore lint/suspicious/noExplicitAny: minimal layout shape for test
		expect(shouldSeedChat(EMPTY as any)).toBe(true);
	});

	it("returns false when the layout already has a tab", () => {
		// biome-ignore lint/suspicious/noExplicitAny: minimal layout shape for test
		expect(shouldSeedChat(WITH_TAB as any)).toBe(false);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/shouldSeedChat/shouldSeedChat.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `shouldSeedChat.ts`:

```ts
import type { WorkspaceState } from "@rox/panes";
import type { PaneViewerData } from "../../types";

/**
 * Whether to seed a chat tab when entering a workspace.
 * True only for a known-but-empty layout (no tabs). A null/undefined layout
 * means "not hydrated yet" → never seed (anti-race guarantee, paired with the
 * isLayoutHydrated gate in page.tsx).
 */
export function shouldSeedChat(
	persistedLayout: WorkspaceState<PaneViewerData> | null | undefined,
): boolean {
	if (!persistedLayout) return false;
	return persistedLayout.tabs.length === 0;
}
```

Create `index.ts`:

```ts
export { shouldSeedChat } from "./shouldSeedChat";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/shouldSeedChat/shouldSeedChat.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/shouldSeedChat/
git commit -m "feat(desktop): add tested shouldSeedChat predicate"
```

---

## Task 6: Add `intent` + `mainWorkspaceId` to the add-repository modal store

**Files:**
- Modify: `apps/desktop/src/renderer/stores/add-repository-modal.ts`

Typecheck-verified (store shape change). Default `intent` is `"return-id"` so existing callers (ProjectPickerPill) keep current behavior.

- [ ] **Step 1: Carry `mainWorkspaceId` on the result and add the `NewProjectIntent` type**

Change:

```ts
export interface NewProjectResult {
	projectId: string;
}
```

to:

```ts
export interface NewProjectResult {
	projectId: string;
	/** main-workspace of the created project; null if it could not be created. */
	mainWorkspaceId: string | null;
}

/**
 * What the caller wants after a successful create.
 *  - "open": the modal wiring should navigate into the main-workspace.
 *  - "return-id": no navigation; caller uses projectId itself (e.g. the
 *    ProjectPickerPill selecting the project inside the new-workspace form).
 */
export type NewProjectIntent = "open" | "return-id";
```

- [ ] **Step 2: Thread `intent` through `ActiveModal` and the open actions**

Change the `ActiveModal` union:

```ts
type ActiveModal =
	| { kind: "none" }
	| { kind: "new-project" }
	| { kind: "template-gallery" };
```

to:

```ts
type ActiveModal =
	| { kind: "none" }
	| { kind: "new-project"; intent: NewProjectIntent }
	| { kind: "template-gallery"; intent: NewProjectIntent };
```

Change the action signatures in `AddRepositoryModalState`:

```ts
	openNewProject: () => Promise<NewProjectResult | null>;
	openTemplateGallery: () => Promise<NewProjectResult | null>;
```

to:

```ts
	openNewProject: (opts?: {
		intent?: NewProjectIntent;
	}) => Promise<NewProjectResult | null>;
	openTemplateGallery: (opts?: {
		intent?: NewProjectIntent;
	}) => Promise<NewProjectResult | null>;
```

Change the `openNewProject` implementation:

```ts
			openNewProject: () => {
				pendingResolve?.(null);
				return new Promise<NewProjectResult | null>((resolve) => {
					pendingResolve = resolve;
					set({ active: { kind: "new-project" } });
				});
			},
```

to:

```ts
			openNewProject: ({ intent = "return-id" } = {}) => {
				pendingResolve?.(null);
				return new Promise<NewProjectResult | null>((resolve) => {
					pendingResolve = resolve;
					set({ active: { kind: "new-project", intent } });
				});
			},
```

Apply the same change to `openTemplateGallery`:

```ts
			openTemplateGallery: ({ intent = "return-id" } = {}) => {
				pendingResolve?.(null);
				return new Promise<NewProjectResult | null>((resolve) => {
					pendingResolve = resolve;
					set({ active: { kind: "template-gallery", intent } });
				});
			},
```

- [ ] **Step 3: Typecheck (expect downstream errors — they are fixed in Tasks 7–9)**

Run: `bunx turbo typecheck --filter=@rox/desktop`
Expected: type errors ONLY in `AddRepositoryModals.tsx` (missing `mainWorkspaceId` on `resolveNewProject({ projectId })`). Those are resolved in Task 7. If errors appear elsewhere unexpectedly, investigate before continuing.

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/stores/add-repository-modal.ts
git commit -m "feat(desktop): add open/return-id intent + mainWorkspaceId to project modal store"
```

---

## Task 7: Navigate into the chat after create (AddRepositoryModals)

**Files:**
- Modify: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/AddRepositoryModals.tsx`

Uses the pure `resolveNewProjectIntent` (Task 4) to decide navigation. `result` in `onSuccess` is a `ProjectSetupResult` (already carries `mainWorkspaceId`).

- [ ] **Step 1: Add imports**

Add:

```tsx
import { useNavigate } from "@tanstack/react-router";
import { resolveNewProjectIntent } from "renderer/stores/utils/resolveNewProjectIntent";
```

- [ ] **Step 2: Add navigate + a helper inside the component**

After the existing store/hook lines (e.g. after `const offerGitHubPublish = useOfferGitHubPublish();`):

```tsx
	const navigate = useNavigate();

	const maybeOpenWorkspace = (
		intent: "open" | "return-id",
		mainWorkspaceId: string | null,
	) => {
		const decision = resolveNewProjectIntent(intent, mainWorkspaceId);
		if (decision.kind === "navigate-workspace") {
			void navigate({
				to: "/v2-workspace/$workspaceId",
				params: { workspaceId: decision.workspaceId },
			});
		}
	};
```

- [ ] **Step 3: Update the NewProjectModal `onSuccess`**

Change:

```tsx
				onSuccess={(result) => {
					toast.success("Project created.");
					resolveNewProject({ projectId: result.projectId });
				}}
```

to:

```tsx
				onSuccess={(result) => {
					toast.success("Project created.");
					const intent =
						active.kind === "new-project" ? active.intent : "return-id";
					resolveNewProject({
						projectId: result.projectId,
						mainWorkspaceId: result.mainWorkspaceId,
					});
					maybeOpenWorkspace(intent, result.mainWorkspaceId);
				}}
```

- [ ] **Step 4: Update the TemplateGalleryModal `onCreated`**

Change:

```tsx
				onCreated={(result) => {
					toast.success("Project created.");
					resolveNewProject({ projectId: result.projectId });
					offerGitHubPublish({ projectId: result.projectId });
				}}
```

to:

```tsx
				onCreated={(result) => {
					toast.success("Project created.");
					const intent =
						active.kind === "template-gallery" ? active.intent : "return-id";
					resolveNewProject({
						projectId: result.projectId,
						mainWorkspaceId: result.mainWorkspaceId,
					});
					maybeOpenWorkspace(intent, result.mainWorkspaceId);
					offerGitHubPublish({ projectId: result.projectId });
				}}
```

> This reads `result.mainWorkspaceId` from `TemplateGalleryModal.onCreated` — Task 8 makes that callback carry it. Do Task 8 in the same branch (typecheck will fail here until it lands).

- [ ] **Step 5: Typecheck (expects Task 8 done)**

Run: `bunx turbo typecheck --filter=@rox/desktop`
Expected: PASS once Task 8 is also applied (the `onCreated` result type carries `mainWorkspaceId`). If you run before Task 8, you'll see a type error on `result.mainWorkspaceId` in the template branch — proceed to Task 8.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/AddRepositoryModals.tsx
git commit -m "feat(desktop): navigate into chat after project create (open intent)"
```

---

## Task 8: Make `TemplateGalleryModal.onCreated` carry `mainWorkspaceId`

**Files:**
- Modify: `apps/desktop/src/renderer/routes/_authenticated/components/TemplateGalleryModal/TemplateGalleryModal.tsx`

The inner `result` (line 89) already has `mainWorkspaceId`; only the outward callback drops it.

- [ ] **Step 1: Widen the `onCreated` prop type**

Change (line 25):

```tsx
	onCreated: (result: { projectId: string }) => void;
```

to:

```tsx
	onCreated: (result: { projectId: string; mainWorkspaceId: string | null }) => void;
```

- [ ] **Step 2: Capture `mainWorkspaceId` alongside `createdProjectId`**

Change (line 79):

```tsx
		let createdProjectId: string | null = null;
```

to:

```tsx
		let createdProjectId: string | null = null;
		let createdMainWorkspaceId: string | null = null;
```

In the v2 branch, change (line 99):

```tsx
				finalizeSetup(activeHostUrl, result);
				createdProjectId = result.projectId;
```

to:

```tsx
				finalizeSetup(activeHostUrl, result);
				createdProjectId = result.projectId;
				createdMainWorkspaceId = result.mainWorkspaceId;
```

(The v1 branch at line 101 returns only a project id — `createdMainWorkspaceId` stays `null`, which is correct: that legacy path won't navigate.)

- [ ] **Step 3: Pass it to `onCreated`**

Change (line 113):

```tsx
		if (createdProjectId) onCreated({ projectId: createdProjectId });
```

to:

```tsx
		if (createdProjectId)
			onCreated({
				projectId: createdProjectId,
				mainWorkspaceId: createdMainWorkspaceId,
			});
```

- [ ] **Step 4: Typecheck**

Run: `bunx turbo typecheck --filter=@rox/desktop`
Expected: PASS (Task 7 + Task 8 together resolve the modal types).

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/renderer/routes/_authenticated/components/TemplateGalleryModal/TemplateGalleryModal.tsx
git commit -m "feat(desktop): surface mainWorkspaceId from TemplateGalleryModal.onCreated"
```

---

## Task 9: Ask the sidebar create entries to open the workspace

**Files:**
- Modify: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarHeader/DashboardSidebarHeader.tsx`

The sidebar "Clone from URL" (lines 303, 475) and "Start from template" (lines 311, 483) are fire-and-forget — they should pass `intent: "open"` so creation navigates into the chat.

- [ ] **Step 1: Pass `intent: "open"` to the four create entries**

Change both "Clone from URL" items (lines ~303 and ~475):

```tsx
						<DropdownMenuItem onSelect={() => openNewProject()}>
```

to:

```tsx
						<DropdownMenuItem onSelect={() => openNewProject({ intent: "open" })}>
```

Change both "Start from template" items (lines ~311 and ~483) similarly:

```tsx
						<DropdownMenuItem onSelect={() => openTemplateGallery()}>
```

to:

```tsx
						<DropdownMenuItem onSelect={() => openTemplateGallery({ intent: "open" })}>
```

> Verify the exact surrounding text of each `DropdownMenuItem` before editing (collapsed vs expanded header variants). There are exactly two of each; do not change `ProjectPickerPill` (it must keep the default `return-id`).

- [ ] **Step 2: Typecheck**

Run: `bunx turbo typecheck --filter=@rox/desktop`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarHeader/DashboardSidebarHeader.tsx
git commit -m "feat(desktop): sidebar project create opens the workspace chat"
```

---

## Task 10: Expose layout hydration from `useV2WorkspacePaneLayout`

**Files:**
- Modify: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2WorkspacePaneLayout/useV2WorkspacePaneLayout.ts`

Seeding a chat (Task 11) must wait for strict readiness (AGENTS.md rule 9: write/seeding side-effects wait for `isReady`, not cache-first). Expose `isLayoutHydrated` (the collection's `isReady`) and `persistedPaneLayout`.

- [ ] **Step 1: Capture `isReady` from the live query**

Change:

```ts
	const { data: localWorkspaceRows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2WorkspaceLocalState: collections.v2WorkspaceLocalState })
				.where(({ v2WorkspaceLocalState }) =>
					eq(v2WorkspaceLocalState.workspaceId, workspaceId),
				),
		[collections, workspaceId],
	);
```

to:

```ts
	const { data: localWorkspaceRows = [], isReady: isLocalStateReady } =
		useLiveQuery(
			(query) =>
				query
					.from({ v2WorkspaceLocalState: collections.v2WorkspaceLocalState })
					.where(({ v2WorkspaceLocalState }) =>
						eq(v2WorkspaceLocalState.workspaceId, workspaceId),
					),
			[collections, workspaceId],
		);
```

- [ ] **Step 2: Return the hydration flag and the persisted layout**

Change the return (line ~107):

```ts
	return { store };
```

to:

```ts
	// Hydration is "done" once the collection is ready for this workspaceId.
	// Until then persistedPaneLayout may be a premature EMPTY_STATE (the live
	// query hasn't delivered the row yet) — seeding on that would race the
	// replaceState hydration below, so the seeder must gate on this flag.
	const isLayoutHydrated = isLocalStateReady;
	return { store, isLayoutHydrated, persistedPaneLayout };
```

> Verify `useLiveQuery` exposes `isReady` in this repo's `@tanstack/react-db` version (AGENTS.md rule 9 references it explicitly). If the field name differs, use the equivalent. `persistedPaneLayout` is already computed in this hook (the value used for `replaceState`); just include it in the return object.

- [ ] **Step 3: Typecheck**

Run: `bunx turbo typecheck --filter=@rox/desktop`
Expected: PASS (additive return fields; existing `const { store } = ...` callers keep working).

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useV2WorkspacePaneLayout/useV2WorkspacePaneLayout.ts
git commit -m "feat(desktop): expose isLayoutHydrated + persistedPaneLayout for chat seeding"
```

---

## Task 11: Seed an empty chat tab as the default surface

**Files:**
- Modify: `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx`

When an empty workspace is opened (the post-create case), auto-open one empty chat tab instead of the chooser — once per workspace, after hydration, guarded against races. `addChatTab` (from `useWorkspacePaneOpeners`) already creates a `{ kind: "chat", data: { sessionId: null } }` tab and activates it.

- [ ] **Step 1: Ensure `useRef` is imported**

The file already imports `useCallback, useEffect, useState` from React. Add `useRef`:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
```

- [ ] **Step 2: Import `shouldSeedChat`**

```tsx
import { shouldSeedChat } from "./utils/shouldSeedChat";
```

- [ ] **Step 3: Consume the new hook fields**

Change:

```tsx
	const { store } = useV2WorkspacePaneLayout();
```

to:

```tsx
	const { store, isLayoutHydrated, persistedPaneLayout } =
		useV2WorkspacePaneLayout();
```

- [ ] **Step 4: Add the seed effect**

Add after the `useWorkspacePaneOpeners({ ... })` destructuring that yields `addChatTab` (around line 185–196):

```tsx
	// After creating a project the user lands in an empty main-workspace.
	// Open one empty chat tab instead of the chooser — once per workspace, only
	// after the persisted layout has hydrated and is genuinely empty.
	const seededWorkspaceIdRef = useRef<string | null>(null);
	useEffect(() => {
		if (!isLayoutHydrated) return; // wait for strict readiness (no cache-first)
		if (seededWorkspaceIdRef.current === workspaceId) return; // idempotent
		if (!shouldSeedChat(persistedPaneLayout)) {
			// Not empty (or already has tabs): mark handled so later layout edits
			// don't re-trigger the seed.
			seededWorkspaceIdRef.current = workspaceId;
			return;
		}
		// Double-guard against a race: re-check the live store before writing.
		if (store.getState().tabs.length > 0) {
			seededWorkspaceIdRef.current = workspaceId;
			return;
		}
		seededWorkspaceIdRef.current = workspaceId;
		addChatTab();
	}, [isLayoutHydrated, persistedPaneLayout, workspaceId, store, addChatTab]);
```

> Leave `renderEmptyState` (the `WorkspaceEmptyState` chooser, ~line 343–350) as-is. After the one-time seed, if the user manually closes every tab, the ref is already set for this `workspaceId`, so the chooser shows as a correct fallback (no fighting the user by re-seeding).

- [ ] **Step 5: Typecheck**

Run: `bunx turbo typecheck --filter=@rox/desktop`
Expected: PASS.

- [ ] **Step 6: Lint**

Run: `bun run lint < /dev/null`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/page.tsx
git commit -m "feat(desktop): seed empty chat tab as default surface of empty workspace"
```

---

## Task 12: Full verification + visual evidence

**Files:** none (verification only).

- [ ] **Step 1: Run all new unit tests**

Run:
```bash
bun test apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/MicButton/canStartDictation.test.ts
bun test apps/desktop/src/renderer/stores/utils/resolveNewProjectIntent/resolveNewProjectIntent.test.ts
bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/shouldSeedChat/shouldSeedChat.test.ts
```
Expected: all PASS.

- [ ] **Step 2: Typecheck + lint the whole desktop app**

Run:
```bash
bunx turbo typecheck --filter=@rox/desktop
bun run lint < /dev/null
```
Expected: both clean (exit 0, no warnings — CI treats warnings as errors).

- [ ] **Step 3: Manual visual run (the part unit tests can't cover)**

Launch desktop dev (see `apps/desktop/BUILDING.md`), sign in as Local Admin (dev), then verify the two behaviors:

1. **Voice gate:** the mic button is visible and active in the chat composer when `GROQ_API_KEY` is set in the running server env; with the key unset it renders disabled (faded), never throwing on click.
2. **Project → chat:** from the sidebar, "Clone from URL" / "Start from template" → after the project is created you land on `/v2-workspace/<id>` with an **empty chat tab focused** (cursor in the composer), not the chooser screen. Confirm the `ProjectPickerPill` flow (create project from inside the new-workspace form) still selects the project and does NOT navigate away.

- [ ] **Step 4: Capture Peekaboo screenshots as evidence**

Capture the running app: (a) the chat composer showing the active mic button, (b) the freshly-created project opened directly on a chat tab. Save under the project's evidence location and reference them in the PR.

- [ ] **Step 5: Final commit / open PR (per git policy)**

```bash
git push -u origin feat/voice-everywhere-instant-chat
gh pr create --fill
```

---

## Self-review (coverage vs spec)

- Spec block **B (voice always-on)** → Tasks 1 (env key), 2 (`canStartDictation`), 3 (`voice.isConfigured` gate). ✓
- Spec block **C (project → chat)** → Tasks 4 (`resolveNewProjectIntent`), 5 (`shouldSeedChat`), 6 (store intent), 7 (navigate), 8 (template `mainWorkspaceId`), 9 (sidebar intent), 10 (hydration flag), 11 (seed effect). ✓
- Spec block **A / D / E** → explicitly out of scope (separate Phase-1 Web plan). ✓
- **Risks carried from spec:** ProjectPickerPill regression → default `intent: "return-id"` + Task 9 only flips sidebar entries. Seed/hydration race → Task 10 `isReady` gate + Task 11 ref + live re-check. Persistence of seeded tab for brand-new workspace → known limitation (runtime-only until a `v2WorkspaceLocalState` row exists), acceptable for "open chat immediately"; out of scope to persist.
- **Type consistency:** `NewProjectResult.mainWorkspaceId` / `NewProjectIntent` / `resolveNewProjectIntent` / `shouldSeedChat` / `canStartDictation` / `dictationConfigured` / `{ store, isLayoutHydrated, persistedPaneLayout }` are used identically across tasks. ✓
- **Ordering caveat:** Task 4 imports `NewProjectIntent` from Task 6; Task 7 reads `mainWorkspaceId` from Task 8. Apply tasks in-branch; the notes flag the cross-task dependency.
