# Voice everywhere (shared core) + instant web chat (Phase 1 · Web) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lift the desktop voice-dictation core into the shared `@rox/ui` package with **zero desktop-specific dependencies** (the only desktop coupling — the `DICTATE` hotkey — moves to the desktop edge), then use that shared core to bring **voice + a working quick LLM chat to the web app**. After this plan, a signed-in web user can open a "Новый чат", talk or type to the Rox house model, and get a complete reply. Desktop stays green (same behavior, importing the moved core).

**Architecture:** Three blocks, executed in order.

```
            packages/ui/src/voice/   (shared core — ZERO desktop deps)
            ├─ useDictation          getUserMedia + MediaRecorder + level metering
            ├─ blobToBase64          pure Blob -> base64 (no data-URL prefix)
            ├─ canStartDictation     pure guard (disabled || transcribing)  [TDD]
            ├─ MicButton             PTT + toggle-lock gestures; hotkey is INJECTED
            └─ WaveformOverlay       live waveform + timer + cancel/confirm
                     │  exported via "@rox/ui/voice"
       ┌─────────────┴──────────────────────────┐
  desktop edge                              web edge
  ChatComposerControls + ChatInputFooter    WebQuickChatView (new) +
  wires useHotkey("DICTATE") around          PreviewPromptComposer (un-stubbed)
  the shared MicButton                       trpcClient.voice.transcribe / chat.complete
  apiClient (Electron IPC -> cloud)          trpcClient (HTTP, credentials: include)
                     │                                  │
              voice.transcribe (Groq Whisper)    chat.complete (Rox house model)
              server GROQ_API_KEY                 server ROX_AI_API_KEY
```

- **Block A — shared voice core.** Move the four voice files + the `canStartDictation` test from desktop into `packages/ui/src/voice/`, add a `"@rox/ui/voice"` package export, and **parametrize the hotkey out of `MicButton`** so `packages/ui` imports nothing from `renderer/*`. The desktop consumer keeps the exact `DICTATE` / Ctrl+Shift+D behavior by wiring `useHotkey("DICTATE", …)` at the edge and passing the toggle into the shared `MicButton`. Delete the dead `PromptInputSpeechButton`.
- **Block D — web quick chat.** Document `ROX_AI_API_KEY` (names only). Build a real `WebQuickChatView` by copying the desktop `QuickChatView` pattern (local `useState` messages, `sessionId` via `crypto.randomUUID()` in a ref, `chat.complete` via the web `trpcClient`, `status: ok | needs-user-key | not-configured` handling). Replace the stub `PreviewPromptComposer` `onSubmit` so the composer actually sends. Add a "Новый чат" entry on `AgentsCabinet` that routes to the working chat at `/agents/chat`. This is a quick LLM chat, NOT the agent-coder.
- **Block E — web voice.** Mount the shared `@rox/ui/voice` `MicButton` in the web chat composer (no hotkey on web); `onComplete -> trpcClient.voice.transcribe.mutate({ audioBase64, mimeType, durationMs })`; insert the transcript via `usePromptInputController().textInput`. Browser recording works out of the box (`MediaRecorder`) but needs a **secure context** (HTTPS or localhost) for `getUserMedia`.

**Tech Stack:** Bun + Turbo monorepo. `apps/web` = **Next.js 16 App Router** (route group `app/(agents)/`, navigation via `next/link` + `next/navigation`; NOT TanStack Router). UI in `@rox/ui` (React 19 + Tailwind v4 + shadcn). tRPC over HTTP via `apps/web/src/trpc/client.ts` (`trpcClient`, `httpBatchLink`, `credentials: "include"`, SuperJSON) and `apps/web/src/trpc/react.tsx` (`useTRPC` / `TRPCProvider`). `bun:test` co-located tests. Biome lint at root.

**Companion spec:** `docs/superpowers/specs/2026-06-23-voice-everywhere-and-instant-chat-design.md` (blocks A, D, E).

**Companion desktop plan (Phase 1 · Desktop, already drafted):** `plans/2026-06-23-voice-and-instant-chat-phase1-desktop.md` (blocks B + C). That plan already added the `voice.isConfigured` gate in `ChatInputFooter` / `ChatComposerControls` and a co-located `canStartDictation` + test under the desktop `MicButton` folder — this plan **moves** those into `@rox/ui/voice` and re-points the desktop imports.

**Conventions / gotchas:**
- Branch: `feat/voice-everywhere-instant-chat` (already checked out — do NOT switch). Commit steps assume you are cleared to commit per the repo's standing git policy; if not, stage and pause.
- Run a single test: `bun test <path>`. Typecheck a package: `bunx turbo typecheck --filter=<name>` (`@rox/ui`, `@rox/web`, `@rox/desktop`). Lint: `bun run lint < /dev/null` (the stdin redirect avoids an `rg` hang in non-interactive shells; CI fails on warnings too — run `bun run lint:fix` after edits, then confirm `bun run lint < /dev/null` exits 0).
- Indentation in this repo is **tabs** (Biome). All code blocks below use tabs; preserve them.
- New folders follow repo convention: `Name/Name.ts(x)` + co-located `Name.test.ts` + `index.ts` barrel. Exception: `src/components/ui/` and `src/components/ai-elements/` are kebab-case shadcn files.
- `@rox/ui` exports are explicit in `packages/ui/package.json`. The existing `"./*": "./src/components/ui/*.tsx"` glob only covers `src/components/ui`; a `src/voice/` folder needs its **own** `"./voice"` export entry — do not rely on the glob.
- The shared core must not import `react-hotkeys-hook`, `renderer/*`, Electron, or any tRPC client. Keep transport (tRPC) and hotkeys at the app edges.

---

## BLOCK A — Shared voice core in `@rox/ui` (zero desktop deps)

### Task A1: Create `blobToBase64` in `@rox/ui/voice` (pure)

Move the pure encoder first; it has no dependencies and both edges need it.

**Files:**
- Create: `packages/ui/src/voice/blobToBase64/blobToBase64.ts`
- Create: `packages/ui/src/voice/blobToBase64/blobToBase64.test.ts`
- Create: `packages/ui/src/voice/blobToBase64/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/ui/src/voice/blobToBase64/blobToBase64.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { blobToBase64 } from "./blobToBase64";

describe("blobToBase64", () => {
	it("encodes bytes to base64 with no data-URL prefix", async () => {
		const blob = new Blob([new Uint8Array([104, 105])], {
			type: "application/octet-stream",
		});
		// "hi" -> base64 "aGk="
		expect(await blobToBase64(blob)).toBe("aGk=");
	});

	it("returns an empty string for an empty blob", async () => {
		const blob = new Blob([], { type: "audio/webm" });
		expect(await blobToBase64(blob)).toBe("");
	});

	it("round-trips a larger buffer that crosses the chunk boundary", async () => {
		const bytes = new Uint8Array(0x8000 + 5).map((_, i) => i % 251);
		const blob = new Blob([bytes], { type: "audio/webm" });
		const base64 = await blobToBase64(blob);
		const decoded = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
		expect(decoded.length).toBe(bytes.length);
		expect(decoded[0]).toBe(bytes[0]);
		expect(decoded[decoded.length - 1]).toBe(bytes[bytes.length - 1]);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/ui/src/voice/blobToBase64/blobToBase64.test.ts`
Expected: FAIL — `Cannot find module './blobToBase64'`.

- [ ] **Step 3: Write the implementation** (identical to the desktop original, now shared)

Create `packages/ui/src/voice/blobToBase64/blobToBase64.ts`:

```ts
/**
 * Encode an audio Blob to a base64 string (no data-URL prefix) for sending to
 * the voice.transcribe tRPC procedure. Chunked to avoid call-stack limits on
 * large buffers.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
	const buffer = await blob.arrayBuffer();
	const bytes = new Uint8Array(buffer);
	let binary = "";
	const chunkSize = 0x8000;
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}
	return btoa(binary);
}
```

Create `packages/ui/src/voice/blobToBase64/index.ts`:

```ts
export { blobToBase64 } from "./blobToBase64";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test packages/ui/src/voice/blobToBase64/blobToBase64.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/voice/blobToBase64/
git commit -m "feat(ui/voice): add shared blobToBase64 encoder (TDD)"
```

---

### Task A2: Create `canStartDictation` in `@rox/ui/voice` (pure, TDD) and remove the desktop copy

The desktop plan added `canStartDictation` + test under the desktop `MicButton` folder. Move both into the shared core so the moved `MicButton` (Task A4) imports a co-located guard, and delete the desktop originals so there is exactly one definition.

**Files:**
- Create: `packages/ui/src/voice/canStartDictation/canStartDictation.ts`
- Create: `packages/ui/src/voice/canStartDictation/canStartDictation.test.ts`
- Create: `packages/ui/src/voice/canStartDictation/index.ts`
- Delete: `apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/MicButton/canStartDictation.ts`
- Delete: `apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/MicButton/canStartDictation.test.ts`

- [ ] **Step 1: Write the test in the new location**

Create `packages/ui/src/voice/canStartDictation/canStartDictation.test.ts`:

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

Run: `bun test packages/ui/src/voice/canStartDictation/canStartDictation.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation + barrel**

Create `packages/ui/src/voice/canStartDictation/canStartDictation.ts`:

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

Create `packages/ui/src/voice/canStartDictation/index.ts`:

```ts
export { canStartDictation } from "./canStartDictation";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test packages/ui/src/voice/canStartDictation/canStartDictation.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Delete the desktop copies**

```bash
git rm apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/MicButton/canStartDictation.ts \
       apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/MicButton/canStartDictation.test.ts
```

> The desktop `MicButton.tsx` still imports `./canStartDictation` at this point — that import is removed when `MicButton` itself moves in Task A4. Do not typecheck desktop in isolation between A2 and A4; the block is verified end-to-end in Task A8.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/voice/canStartDictation/
git commit -m "refactor(ui/voice): move canStartDictation guard into shared core"
```

---

### Task A3: Move `useDictation` into `@rox/ui/voice` (platform-neutral)

`useDictation` imports only React + Web APIs (`getUserMedia`, `MediaRecorder`, `AudioContext`) — it is already platform-neutral and moves verbatim. The desktop file is replaced with a **thin re-export** so existing desktop imports (`renderer/lib/voice/useDictation`) keep resolving without touching every call site.

**Files:**
- Create: `packages/ui/src/voice/useDictation/useDictation.ts` (verbatim copy of the desktop file)
- Create: `packages/ui/src/voice/useDictation/index.ts`
- Replace: `apps/desktop/src/renderer/lib/voice/useDictation/useDictation.ts` (becomes a re-export)

- [ ] **Step 1: Copy the hook into the shared core**

Create `packages/ui/src/voice/useDictation/useDictation.ts` with the **exact** current contents of `apps/desktop/src/renderer/lib/voice/useDictation/useDictation.ts` (the full file: `DictationState`, `Recording`, `UseDictationOptions`, `UseDictation`, `pickMimeType`, `useDictation`). No code changes — it is already dependency-clean.

Create `packages/ui/src/voice/useDictation/index.ts`:

```ts
export {
	type DictationState,
	type Recording,
	type UseDictation,
	type UseDictationOptions,
	useDictation,
} from "./useDictation";
```

- [ ] **Step 2: Turn the desktop hook file into a re-export**

Replace the entire contents of `apps/desktop/src/renderer/lib/voice/useDictation/useDictation.ts` with:

```ts
// Voice dictation core now lives in the shared @rox/ui package so web/desktop
// (and a future mobile adapter) share one implementation. This thin re-export
// keeps the existing `renderer/lib/voice/useDictation` import path working.
export {
	type DictationState,
	type Recording,
	type UseDictation,
	type UseDictationOptions,
	useDictation,
} from "@rox/ui/voice";
```

> `apps/desktop/src/renderer/lib/voice/useDictation/index.ts` already re-exports from `./useDictation`, so the public desktop path is unchanged. (`@rox/ui/voice` is wired up as a package export in Task A4 Step 2 — apply A4 in the same branch before typechecking.)

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/voice/useDictation/ apps/desktop/src/renderer/lib/voice/useDictation/useDictation.ts
git commit -m "refactor(ui/voice): move useDictation recorder hook into shared core"
```

---

### Task A4: Move `MicButton` + `WaveformOverlay` into `@rox/ui/voice` and parametrize the hotkey out

This is the core of Block A. `WaveformOverlay` is already neutral and moves verbatim. `MicButton` currently imports `useHotkey` from `renderer/hotkeys` — the ONLY desktop dependency. We **remove that import** and replace the hotkey side-effect with an injected toggle: `MicButton` exposes its imperative "toggle dictation" action to the parent via an `onReady` callback. The desktop edge (Task A6) wires `useHotkey("DICTATE", …)` to that toggle; web (Block E) passes nothing.

**Files:**
- Create: `packages/ui/src/voice/MicButton/MicButton.tsx` (moved + de-hotkeyed)
- Create: `packages/ui/src/voice/MicButton/WaveformOverlay.tsx` (verbatim move)
- Create: `packages/ui/src/voice/MicButton/index.ts`
- Modify: `packages/ui/package.json` (add the `"./voice"` export)
- Create: `packages/ui/src/voice/index.ts` (the `@rox/ui/voice` barrel)

- [ ] **Step 1: Copy `WaveformOverlay` verbatim**

Create `packages/ui/src/voice/MicButton/WaveformOverlay.tsx` with the **exact** current contents of `apps/desktop/.../MicButton/WaveformOverlay.tsx` (imports `@rox/ui/utils` + `lucide-react` + React — all available inside `@rox/ui`; `cn` resolves via the package's own `@rox/ui/utils` export). No changes.

- [ ] **Step 2: Add the `@rox/ui/voice` package export and barrel**

In `packages/ui/package.json`, add a `"./voice"` entry to `exports` (place it next to the other component entries, e.g. right after the `"./motion": "./src/motion/index.ts",` line):

```json
		"./motion": "./src/motion/index.ts",
		"./voice": "./src/voice/index.ts",
		"./*": "./src/components/ui/*.tsx"
```

Create `packages/ui/src/voice/index.ts`:

```ts
export { blobToBase64 } from "./blobToBase64";
export { canStartDictation } from "./canStartDictation";
export { MicButton, type MicButtonProps } from "./MicButton";
export { WaveformOverlay } from "./MicButton/WaveformOverlay";
export {
	type DictationState,
	type Recording,
	type UseDictation,
	type UseDictationOptions,
	useDictation,
} from "./useDictation";
```

Create `packages/ui/src/voice/MicButton/index.ts`:

```ts
export { MicButton, type MicButtonProps } from "./MicButton";
export { WaveformOverlay } from "./WaveformOverlay";
```

- [ ] **Step 3: Write the de-hotkeyed `MicButton`**

Create `packages/ui/src/voice/MicButton/MicButton.tsx`:

```tsx
import { cn } from "@rox/ui/utils";
import { Loader2Icon, MicIcon } from "lucide-react";
import type React from "react";
import { useEffect, useRef } from "react";
import { type Recording, useDictation } from "../useDictation";
import { canStartDictation } from "../canStartDictation";
import { WaveformOverlay } from "./WaveformOverlay";

/** Upward drag (px) past which a held recording locks into toggle mode. */
const LOCK_DRAG_THRESHOLD = 44;

/**
 * Imperative controls a host (e.g. a desktop hotkey) can drive. `toggle` mirrors
 * the keyboard behavior the desktop used to own internally: start+lock when idle,
 * stop when active — but only if dictation may currently start.
 */
export interface MicButtonControls {
	toggle: () => void;
}

export interface MicButtonProps {
	onComplete?: (recording: Recording, locked: boolean) => void;
	transcribing?: boolean;
	disabled?: boolean;
	/**
	 * Receives imperative controls once mounted (and `null` on unmount). The
	 * desktop edge uses this to bind `useHotkey("DICTATE", controls.toggle)`
	 * outside this package so @rox/ui stays free of renderer/hotkeys. Web omits it.
	 */
	onReady?: (controls: MicButtonControls | null) => void;
}

/**
 * Dictation mic button with two gestures:
 *   - **push-to-talk**: press and hold to record, release to stop + send.
 *   - **toggle-lock**: press, drag up past a threshold to lock; release keeps
 *     recording; a later tap stops + sends.
 *
 * Platform-neutral: no hotkey/IPC imports. A keyboard shortcut is wired by the
 * host via `onReady` (see desktop ChatComposerControls).
 */
export function MicButton({
	onComplete,
	transcribing,
	disabled,
	onReady,
}: MicButtonProps) {
	const dictation = useDictation({ onComplete });
	const pointerStartY = useRef<number | null>(null);

	// Expose a stable toggle to the host (desktop binds it to the DICTATE hotkey:
	// press to start+lock, press again to stop + insert). Kept in a ref so the
	// identity handed to the host never changes while still seeing live state.
	const dictationRef = useRef(dictation);
	dictationRef.current = dictation;
	const disabledRef = useRef(disabled);
	disabledRef.current = disabled;
	const transcribingRef = useRef(transcribing);
	transcribingRef.current = transcribing;

	const controlsRef = useRef<MicButtonControls>({
		toggle: () => {
			if (!canStartDictation(disabledRef.current, transcribingRef.current)) {
				// Still allow stopping an in-progress (e.g. locked) recording.
				if (dictationRef.current.isActive) dictationRef.current.stop();
				return;
			}
			if (dictationRef.current.isActive) {
				dictationRef.current.stop();
			} else {
				void dictationRef.current.start().then(() => dictationRef.current.lock());
			}
		},
	});

	useEffect(() => {
		onReady?.(controlsRef.current);
		return () => onReady?.(null);
	}, [onReady]);

	const handlePointerDown = (e: React.PointerEvent) => {
		if (!canStartDictation(disabled, transcribing)) return;
		e.preventDefault();
		// A tap while locked stops + sends.
		if (dictation.isLocked) {
			dictation.stop();
			return;
		}
		pointerStartY.current = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
		void dictation.start();
	};

	const handlePointerMove = (e: React.PointerEvent) => {
		if (pointerStartY.current == null || dictation.state !== "recording")
			return;
		if (pointerStartY.current - e.clientY > LOCK_DRAG_THRESHOLD) {
			dictation.lock();
		}
	};

	const handlePointerUp = (e: React.PointerEvent) => {
		(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
		pointerStartY.current = null;
		// PTT release stops + sends; a locked recording keeps going until tapped.
		if (dictation.state === "recording") dictation.stop();
	};

	return (
		<>
			{dictation.isActive && (
				<WaveformOverlay
					level={dictation.audioLevel}
					durationMs={dictation.durationMs}
					locked={dictation.isLocked}
					transcribing={transcribing}
					onStop={dictation.stop}
					onCancel={dictation.cancel}
				/>
			)}
			<button
				type="button"
				aria-label="Диктовать"
				title="Нажмите, чтобы диктовать, или удерживайте"
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				disabled={disabled}
				className={cn(
					"flex size-[23px] items-center justify-center rounded-full border border-transparent p-[5px] transition-colors",
					dictation.isActive
						? "bg-red-500/15 text-red-500"
						: "bg-foreground/10 text-muted-foreground hover:bg-foreground/20",
					disabled && "opacity-40",
				)}
			>
				{transcribing ? (
					<Loader2Icon className="size-3.5 animate-spin" />
				) : (
					<MicIcon className="size-3.5" />
				)}
			</button>
		</>
	);
}
```

> Behavior parity: the previous desktop hotkey branch was `if (!canStartDictation(...)) return; if (isActive) stop(); else start().then(lock);`. The injected `toggle` reproduces this exactly, plus the small safety that an already-active recording can always be stopped. Pointer gestures are unchanged.

- [ ] **Step 4: Delete the desktop `MicButton` originals** (replaced by the shared ones; re-pointed in Task A6)

```bash
git rm apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/MicButton/MicButton.tsx \
       apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/MicButton/WaveformOverlay.tsx
```

> Check whether `apps/desktop/.../MicButton/index.ts` exists. If it does and only re-exports `./MicButton`, leave it for now — Task A6 repoints `ChatComposerControls` to import from `@rox/ui/voice` directly and then deletes this stale barrel. If `ChatComposerControls` imports `"../MicButton"` (folder barrel), Task A6 changes that import.

- [ ] **Step 5: Typecheck the UI package**

Run: `bunx turbo typecheck --filter=@rox/ui`
Expected: PASS — the shared core is self-contained (`@rox/ui/utils`, `lucide-react`, React, and the co-located voice modules). No `renderer/*` imports remain.

- [ ] **Step 6: Run the moved voice tests**

Run:
```bash
bun test packages/ui/src/voice/blobToBase64/blobToBase64.test.ts
bun test packages/ui/src/voice/canStartDictation/canStartDictation.test.ts
```
Expected: PASS.

- [ ] **Step 7: Lint + commit**

```bash
bun run lint:fix
bun run lint < /dev/null
git add packages/ui/ apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/MicButton/
git commit -m "feat(ui/voice): move MicButton+WaveformOverlay to @rox/ui, inject hotkey via onReady"
```

---

### Task A5: Re-point the desktop `audioToBase64` import to the shared encoder

`ChatInputFooter.tsx` imports `blobToBase64` from `renderer/lib/voice/audioToBase64`. Point it at the shared core and delete the desktop copy so there is one encoder.

**Files:**
- Modify: `apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/ChatInputFooter.tsx`
- Delete: `apps/desktop/src/renderer/lib/voice/audioToBase64.ts`

- [ ] **Step 1: Update the import in `ChatInputFooter.tsx`**

Change:

```tsx
import { blobToBase64 } from "renderer/lib/voice/audioToBase64";
import type { Recording } from "renderer/lib/voice/useDictation";
```

to:

```tsx
import { blobToBase64, type Recording } from "@rox/ui/voice";
```

> This collapses two imports into one shared source. `Recording` is identical (it's the same type, now exported from `@rox/ui/voice`). The body of `handleDictationComplete` is unchanged.

- [ ] **Step 2: Delete the desktop encoder copy**

```bash
git rm apps/desktop/src/renderer/lib/voice/audioToBase64.ts
```

> Verify nothing else imports `renderer/lib/voice/audioToBase64` first:
> `grep -rn "lib/voice/audioToBase64" apps/desktop/src` — expect only the line you just changed (now gone). If other consumers exist, repoint them the same way before deleting.

- [ ] **Step 3: Commit** (typecheck happens after Task A6 wires the rest)

```bash
git add apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/ChatInputFooter.tsx
git commit -m "refactor(desktop/voice): use shared @rox/ui/voice blobToBase64"
```

---

### Task A6: Wire the desktop `DICTATE` hotkey at the edge around the shared `MicButton`

Desktop must keep its keyboard shortcut. `ChatComposerControls` renders the `MicButton`; wire `useHotkey("DICTATE", …)` here (it already lives in the renderer tree) and feed the toggle through `onReady`.

**Files:**
- Modify: `apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/ChatComposerControls/ChatComposerControls.tsx`
- Delete (if present and now unused): `apps/desktop/.../ChatInputFooter/components/MicButton/index.ts` and the now-empty `MicButton/` folder

- [ ] **Step 1: Update imports in `ChatComposerControls.tsx`**

Change:

```tsx
import type { Recording } from "renderer/lib/voice/useDictation";
```
```tsx
import { MicButton } from "../MicButton";
```

to:

```tsx
import { MicButton, type MicButtonControls, type Recording } from "@rox/ui/voice";
import { useCallback, useRef } from "react";
import { useHotkey } from "renderer/hotkeys";
```

> `MicButtonControls` is exported from `@rox/ui/voice/MicButton`; re-export it from the `@rox/ui/voice` barrel too (add `type MicButtonControls` to the `MicButton` export line in `packages/ui/src/voice/index.ts` and `packages/ui/src/voice/MicButton/index.ts` — adjust the `export { MicButton, type MicButtonProps }` lines to also include `type MicButtonControls`). If React is already imported in this file, fold `useCallback`/`useRef` into the existing `react` import line instead of adding a new one.

- [ ] **Step 2: Bind the hotkey inside `ChatComposerControls` and pass `onReady`**

Inside the component body (top, before the `return`), add:

```tsx
	// Desktop keyboard shortcut for dictation. The shared MicButton is hotkey-free;
	// it hands us a stable toggle via onReady and we bind DICTATE (Ctrl+Shift+D) to
	// it here, where the renderer hotkey system lives. Web mounts MicButton with no
	// onReady, so it has no shortcut — by design.
	const micControlsRef = useRef<MicButtonControls | null>(null);
	const handleMicReady = useCallback((controls: MicButtonControls | null) => {
		micControlsRef.current = controls;
	}, []);
	useHotkey("DICTATE", () => {
		micControlsRef.current?.toggle();
	});
```

Change the `<MicButton>` JSX:

```tsx
				<MicButton
					onComplete={onDictationComplete}
					transcribing={dictationTranscribing}
					disabled={!dictationConfigured}
				/>
```

to:

```tsx
				<MicButton
					onComplete={onDictationComplete}
					transcribing={dictationTranscribing}
					disabled={!dictationConfigured}
					onReady={handleMicReady}
				/>
```

> Note: the `dictationConfigured` prop + `disabled={!dictationConfigured}` already exist from the desktop plan (Phase 1 · Desktop, Task 3). This task only adds the hotkey wiring + `onReady`.

- [ ] **Step 3: Remove the stale desktop `MicButton` barrel/folder if unused**

```bash
grep -rn "components/MicButton" apps/desktop/src
```
If the only references were the two lines you just changed in `ChatComposerControls.tsx`, delete the leftover barrel and folder:

```bash
git rm -r apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/components/MicButton
```
(If `git rm -r` reports the folder is already empty/untracked, just remove any remaining `index.ts` with `git rm`.)

- [ ] **Step 4: Typecheck desktop**

Run: `bunx turbo typecheck --filter=@rox/desktop`
Expected: PASS — `MicButton` now comes from `@rox/ui/voice`, the hotkey is bound at the edge, `Recording`/`blobToBase64` resolve from the shared core.

- [ ] **Step 5: Lint + commit**

```bash
bun run lint:fix
bun run lint < /dev/null
git add apps/desktop/src/renderer/components/Chat/ChatInterface/components/ChatInputFooter/ packages/ui/src/voice/
git commit -m "feat(desktop/voice): bind DICTATE hotkey at the edge around shared MicButton"
```

---

### Task A7: Delete the dead `PromptInputSpeechButton`

`PromptInputSpeechButton` (Web Speech API) in `packages/ui/src/components/ai-elements/prompt-input.tsx` has 0 consumers and is superseded by the shared `MicButton`. Remove it and its now-orphaned helper types.

**Files:**
- Modify: `packages/ui/src/components/ai-elements/prompt-input.tsx`

- [ ] **Step 1: Confirm zero consumers**

Run:
```bash
grep -rn "PromptInputSpeechButton" apps packages --include="*.ts" --include="*.tsx" | grep -v "prompt-input.tsx"
```
Expected: no output (other than possibly a barrel re-export — if a barrel re-exports it, remove that line too).

- [ ] **Step 2: Delete the component and its dedicated types**

In `packages/ui/src/components/ai-elements/prompt-input.tsx`, delete:
- the `export const PromptInputSpeechButton = (...) => { ... };` block (currently ~lines 1274–1371),
- its `export type PromptInputSpeechButtonProps = ...` (currently ~1267–1272),
- the `SpeechRecognition*` helper types **only used by it**: `SpeechRecognitionResult`, `SpeechRecognitionAlternative`, `SpeechRecognitionErrorEvent`, and the `declare global { interface Window { SpeechRecognition…; webkitSpeechRecognition…; } }` block (currently ~1240–1265). Also remove the `SpeechRecognition` interface/type declaration that backs them if it is in this file and unused elsewhere.

> Verify each deleted symbol is referenced nowhere else in the file before removing (e.g. `grep -n "SpeechRecognition" packages/ui/src/components/ai-elements/prompt-input.tsx`). Leave `MicIcon` imports only if other code in the file still uses them — if `PromptInputSpeechButton` was the sole user of `MicIcon`, drop it from the import to avoid an unused-import lint error.

- [ ] **Step 3: Typecheck + lint**

Run:
```bash
bunx turbo typecheck --filter=@rox/ui
bun run lint:fix
bun run lint < /dev/null
```
Expected: PASS / exit 0. (If `bunx turbo typecheck --filter=@rox/web --filter=@rox/desktop` is cheap, run it too — nothing should import the removed symbol.)

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/ai-elements/prompt-input.tsx
git commit -m "chore(ui): delete dead PromptInputSpeechButton (Web Speech API, 0 consumers)"
```

---

### Task A8: Block A verification gate (desktop stays green)

**Files:** none (verification only).

- [ ] **Step 1: Run the moved voice tests**

```bash
bun test packages/ui/src/voice/blobToBase64/blobToBase64.test.ts
bun test packages/ui/src/voice/canStartDictation/canStartDictation.test.ts
```
Expected: all PASS.

- [ ] **Step 2: Typecheck the three affected packages**

```bash
bunx turbo typecheck --filter=@rox/ui --filter=@rox/desktop
```
Expected: PASS. Confirms the shared core is self-contained and desktop compiles against it.

- [ ] **Step 3: Confirm zero desktop coupling in the shared core**

```bash
grep -rn "renderer/" packages/ui/src/voice
grep -rn "react-hotkeys-hook\|electron\|@rox/chat" packages/ui/src/voice
```
Expected: no output for both — `@rox/ui/voice` has no desktop/Electron/hotkey/tRPC imports.

- [ ] **Step 4: Manual desktop check note**

(Manual, optional here — repeated in the desktop plan's visual run.) Launch desktop dev, open a chat composer: the mic button records on press/hold (PTT) and on Ctrl+Shift+D (toggle-lock); the waveform overlay appears; a recognized clip is transcribed and inserted/sent. This proves the hotkey-at-the-edge wiring preserved desktop behavior.

---

## BLOCK D — Web quick LLM chat (`chat.complete`)

### Task D1: Document `ROX_AI_API_KEY` in env examples (names only)

`GROQ_API_KEY` is already documented (`.env.example:84`, `.env.local.example:91`). `ROX_AI_API_KEY` (read by `packages/trpc/src/router/chat/utils/chat-completion.ts:92` via `readSecret`, declared optional in `packages/trpc/src/env.ts:46`, env-name const `ROX_AI_API_KEY_ENV` in `packages/shared/src/chat-models.ts:12`) is NOT documented. Add it. Doc-only — no value committed; without it, `chat.complete` degrades to `not-configured`.

**Files:**
- Modify: `.env.example` (after the Groq block, ~line 84)
- Modify: `.env.local.example` (after the Groq block, ~line 91)

- [ ] **Step 1: Add the Rox AI section to `.env.example`**

Insert immediately after the `GROQ_API_KEY=` line (the Groq block ends at line 84):

```bash

# -----------------------------------------------------------------------------
# Rox AI gateway (server-side quick-chat completions — chat.complete)
# Shared server key for the Rox house model (ROX R1). Every signed-in user chats
# with it; no per-user provider key needed. Optional: without it, chat.complete
# returns status "not-configured" and the web/desktop quick chat shows a soft
# "model unavailable" notice. Get a key from the Rox AI gateway.
# -----------------------------------------------------------------------------
ROX_AI_API_KEY=
```

- [ ] **Step 2: Add the Rox AI section to `.env.local.example`**

Insert immediately after the `GROQ_API_KEY=` line (the Groq block ends at line 91):

```bash

# -----------------------------------------------------------------------------
# Rox AI gateway (server-side quick-chat — optional for local dev)
# Leave blank: chat.complete returns "not-configured" and the quick chat shows a
# soft notice. Set a real key to exercise the Rox house model locally.
# -----------------------------------------------------------------------------
ROX_AI_API_KEY=
```

- [ ] **Step 3: Commit**

```bash
git add .env.example .env.local.example
git commit -m "docs(env): document shared ROX_AI_API_KEY for quick-chat completions"
```

---

### Task D2: `deriveQuickChatReply` pure function (TDD)

Extract the `chat.complete` `status -> displayed text` mapping (the desktop `QuickChatView` inlines it) into one tested function the web view reuses. This is the unit-testable core of Block D.

**Files:**
- Create: `apps/web/src/app/(agents)/chat/utils/deriveQuickChatReply/deriveQuickChatReply.ts`
- Create: `apps/web/src/app/(agents)/chat/utils/deriveQuickChatReply/deriveQuickChatReply.test.ts`
- Create: `apps/web/src/app/(agents)/chat/utils/deriveQuickChatReply/index.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/app/(agents)/chat/utils/deriveQuickChatReply/deriveQuickChatReply.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import {
	GENERIC_ERROR_NOTICE,
	NEEDS_USER_KEY_NOTICE,
	NOT_CONFIGURED_NOTICE,
	deriveQuickChatReply,
} from "./deriveQuickChatReply";

describe("deriveQuickChatReply", () => {
	it("returns the model reply verbatim on status ok", () => {
		expect(
			deriveQuickChatReply({ status: "ok", sessionId: "s", reply: "Привет!" }),
		).toBe("Привет!");
	});

	it("maps needs-user-key to the bring-your-own-key notice", () => {
		expect(
			deriveQuickChatReply({ status: "needs-user-key", sessionId: "s" }),
		).toBe(NEEDS_USER_KEY_NOTICE);
	});

	it("maps not-configured to the unavailable notice", () => {
		expect(
			deriveQuickChatReply({ status: "not-configured", sessionId: "s" }),
		).toBe(NOT_CONFIGURED_NOTICE);
	});

	it("maps a thrown/null result to the generic error notice", () => {
		expect(deriveQuickChatReply(null)).toBe(GENERIC_ERROR_NOTICE);
	});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test "apps/web/src/app/(agents)/chat/utils/deriveQuickChatReply/deriveQuickChatReply.test.ts"`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/app/(agents)/chat/utils/deriveQuickChatReply/deriveQuickChatReply.ts`:

```ts
import { ROX_CHAT_MODEL_NAME } from "@rox/shared/chat-models";
import type { ChatCompleteOutput } from "@rox/trpc";

/** Shown when a non-house model is picked but no user provider key is set. */
export const NEEDS_USER_KEY_NOTICE = `Для этой модели нужен ваш ключ провайдера. Откройте «Настройки → Модели», чтобы добавить ключ, либо выберите ${ROX_CHAT_MODEL_NAME} — она работает без настройки.`;
/** Shown when the Rox house model itself is not configured server-side. */
export const NOT_CONFIGURED_NOTICE =
	"Модель пока недоступна. Попробуйте позже или обратитесь к администратору.";
/** Shown when the request throws (network / server error). */
export const GENERIC_ERROR_NOTICE =
	"Не удалось получить ответ. Проверьте соединение и попробуйте снова.";

/**
 * Map a chat.complete result (or a null result from a thrown request) to the
 * assistant text to display. Pure; shared by the web quick chat. Mirrors the
 * desktop QuickChatView status handling so behavior stays identical.
 */
export function deriveQuickChatReply(
	result: ChatCompleteOutput | null,
): string {
	if (!result) return GENERIC_ERROR_NOTICE;
	switch (result.status) {
		case "ok":
			return result.reply;
		case "needs-user-key":
			return NEEDS_USER_KEY_NOTICE;
		default:
			return NOT_CONFIGURED_NOTICE;
	}
}
```

Create `apps/web/src/app/(agents)/chat/utils/deriveQuickChatReply/index.ts`:

```ts
export {
	GENERIC_ERROR_NOTICE,
	NEEDS_USER_KEY_NOTICE,
	NOT_CONFIGURED_NOTICE,
	deriveQuickChatReply,
} from "./deriveQuickChatReply";
```

> `ChatCompleteOutput` is already exported from `packages/trpc/src/router/chat/chat.ts` and re-exported by `@rox/trpc`. If `bunx turbo typecheck --filter=@rox/web` reports it is not exported from the package root, add `export type { ChatCompleteOutput } from "./router/chat/chat";` to `packages/trpc/src/root.ts` (or the package index) in this same task and re-run.

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test "apps/web/src/app/(agents)/chat/utils/deriveQuickChatReply/deriveQuickChatReply.test.ts"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(agents)/chat/utils/deriveQuickChatReply/"
git commit -m "feat(web/chat): add tested deriveQuickChatReply status mapper"
```

---

### Task D3: Build `WebQuickChatView` (working web chat, copies the desktop pattern)

Port the desktop `QuickChatView` send-loop to the web `trpcClient`. Local `useState` messages, `sessionId` via `crypto.randomUUID()` in a ref, `chat.complete` over HTTP, the tested `deriveQuickChatReply` for status text. The composer (mic + submit) is wired in Block E via `PreviewPromptComposer`; here we build the message list + send + a temporary plain textarea so the chat is usable immediately and typecheck-clean. (Block E swaps the textarea for the shared composer.)

**Files:**
- Create: `apps/web/src/app/(agents)/chat/components/WebQuickChatView/WebQuickChatView.tsx`
- Create: `apps/web/src/app/(agents)/chat/components/WebQuickChatView/index.ts`

- [ ] **Step 1: Write the view**

Create `apps/web/src/app/(agents)/chat/components/WebQuickChatView/WebQuickChatView.tsx`:

```tsx
"use client";

import { ROX_CHAT_MODEL, ROX_CHAT_MODEL_NAME } from "@rox/shared/chat-models";
import { Button } from "@rox/ui/button";
import { Textarea } from "@rox/ui/textarea";
import { cn } from "@rox/ui/utils";
import { useCallback, useRef, useState } from "react";
import { LuArrowUp, LuLoaderCircle, LuSparkles } from "react-icons/lu";
import { trpcClient } from "@/trpc/client";
import { deriveQuickChatReply } from "../../utils/deriveQuickChatReply";

interface QuickChatMessage {
	id: string;
	role: "user" | "assistant";
	text: string;
}

export function WebQuickChatView() {
	const [input, setInput] = useState("");
	const [messages, setMessages] = useState<QuickChatMessage[]>([]);
	const [isSending, setIsSending] = useState(false);
	// One persisted chat_sessions row per conversation: generated lazily on the
	// first send and reused so the whole thread lands in one session.
	const sessionIdRef = useRef<string | null>(null);
	const scrollRef = useRef<HTMLDivElement>(null);

	const scrollToBottom = useCallback(() => {
		requestAnimationFrame(() => {
			scrollRef.current?.scrollTo({
				top: scrollRef.current.scrollHeight,
				behavior: "smooth",
			});
		});
	}, []);

	const send = useCallback(async () => {
		const text = input.trim();
		if (text.length === 0 || isSending) return;

		if (!sessionIdRef.current) {
			sessionIdRef.current = crypto.randomUUID();
		}
		const sessionId = sessionIdRef.current;

		const now = Date.now();
		const userMessage: QuickChatMessage = {
			id: `u-${now}`,
			role: "user",
			text,
		};
		const history = [...messages, userMessage].map((message) => ({
			role: message.role,
			content: message.text,
		}));

		setMessages((prev) => [...prev, userMessage]);
		setInput("");
		setIsSending(true);
		scrollToBottom();

		const appendAssistant = (assistantText: string) => {
			setMessages((prev) => [
				...prev,
				{ id: `a-${now}`, role: "assistant", text: assistantText },
			]);
			scrollToBottom();
		};

		try {
			const result = await trpcClient.chat.complete.mutate({
				sessionId,
				messages: history,
				modelId: ROX_CHAT_MODEL.id,
			});
			appendAssistant(deriveQuickChatReply(result));
		} catch {
			appendAssistant(deriveQuickChatReply(null));
		} finally {
			setIsSending(false);
		}
	}, [input, isSending, messages, scrollToBottom]);

	const isEmpty = messages.length === 0;

	return (
		<div className="flex h-full w-full flex-1 flex-col overflow-hidden">
			<header className="flex items-center gap-2 border-b border-border px-6 py-4">
				<LuSparkles className="size-5 text-muted-foreground" />
				<div className="min-w-0">
					<h1 className="text-lg font-semibold text-foreground">Быстрый чат</h1>
					<p className="text-sm text-muted-foreground">
						Начните разговор сразу — без проекта и репозитория.
					</p>
				</div>
			</header>

			<div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
				<div className="mx-auto flex max-w-2xl flex-col gap-4">
					{isEmpty ? (
						<div className="mt-12 flex flex-col items-center gap-2 text-center">
							<LuSparkles className="size-8 text-muted-foreground/60" />
							<p className="text-base font-medium text-foreground">Чем помочь?</p>
							<p className="max-w-md text-sm text-muted-foreground">
								Задайте вопрос модели {ROX_CHAT_MODEL_NAME}. Это обычный чат —
								проект создавать не нужно.
							</p>
						</div>
					) : (
						messages.map((message) => (
							<div
								key={message.id}
								className={cn(
									"flex",
									message.role === "user" ? "justify-end" : "justify-start",
								)}
							>
								<div
									className={cn(
										"max-w-[85%] select-text whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm",
										message.role === "user"
											? "bg-primary text-primary-foreground"
											: "bg-muted text-foreground",
									)}
								>
									{message.text}
								</div>
							</div>
						))
					)}
					{isSending ? (
						<div className="flex justify-start">
							<div className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground">
								<LuLoaderCircle className="size-4 animate-spin" />
								{ROX_CHAT_MODEL_NAME} печатает…
							</div>
						</div>
					) : null}
				</div>
			</div>

			<div className="border-t border-border px-6 py-4">
				<div className="mx-auto flex max-w-2xl flex-col gap-2 rounded-xl border border-border bg-card p-2">
					<Textarea
						value={input}
						onChange={(event) => setInput(event.target.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								void send();
							}
						}}
						placeholder="Напишите сообщение…"
						className="min-h-16 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
					/>
					<div className="flex items-center gap-2">
						<Button
							size="icon"
							className="ml-auto size-8 rounded-full"
							disabled={input.trim().length === 0 || isSending}
							onClick={() => void send()}
							aria-label="Отправить"
						>
							{isSending ? (
								<LuLoaderCircle className="size-4 animate-spin" />
							) : (
								<LuArrowUp className="size-4" />
							)}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
```

Create `apps/web/src/app/(agents)/chat/components/WebQuickChatView/index.ts`:

```ts
export { WebQuickChatView } from "./WebQuickChatView";
```

> `trpcClient.chat.complete.mutate(...)` is the vanilla-client call (mirrors how `apiClient.chat.complete.mutate` is used on desktop). It returns the `ChatCompleteOutput` union directly. We fix `modelId` to the Rox house model for Phase 1 (no model picker needed for the web MVP); the backend defaults to it anyway. `react-icons` and `@rox/ui/textarea` / `@rox/ui/button` are already web deps.

- [ ] **Step 2: Typecheck web**

Run: `bunx turbo typecheck --filter=@rox/web`
Expected: PASS.

- [ ] **Step 3: Lint + commit**

```bash
bun run lint:fix
bun run lint < /dev/null
git add "apps/web/src/app/(agents)/chat/"
git commit -m "feat(web/chat): add working WebQuickChatView (chat.complete via trpcClient)"
```

---

### Task D4: Add the `/agents/chat` route page

Mount `WebQuickChatView` at a real route so "Новый чат" has somewhere to land. App Router page under the `(agents)` group.

**Files:**
- Create: `apps/web/src/app/(agents)/chat/page.tsx`

- [ ] **Step 1: Write the page**

Create `apps/web/src/app/(agents)/chat/page.tsx`:

```tsx
import { AgentsHeader } from "../components/AgentsHeader";
import { getAgentsUiAccess } from "../utils/getAgentsUiAccess";
import { WebQuickChatView } from "./components/WebQuickChatView";

export default async function AgentsChatPage() {
	const { hasAgentsUiAccess } = await getAgentsUiAccess();

	return (
		<div className="flex h-[100dvh] flex-col">
			{hasAgentsUiAccess && <AgentsHeader />}
			<WebQuickChatView />
		</div>
	);
}
```

> `getAgentsUiAccess()` is the same gate used by `agents/page.tsx`; it redirects/handles unauthenticated access via the `(agents)` layout, so this page only runs for permitted users (consistent with the rest of the group). If `getAgentsUiAccess` throws/redirects for no-access in other pages, mirror that exact call — do not invent a new gate.

- [ ] **Step 2: Typecheck web + manual route check note**

Run: `bunx turbo typecheck --filter=@rox/web`
Expected: PASS.

Manual (later, in Task E3 visual run): navigating to `/agents/chat` renders the chat with the header; sending a message returns a reply (or a soft notice if `ROX_AI_API_KEY` is unset).

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(agents)/chat/page.tsx"
git commit -m "feat(web/chat): add /agents/chat route mounting WebQuickChatView"
```

---

### Task D5: Add a "Новый чат" entry on `AgentsCabinet`

The web `(agents)` cabinet has no input today. Add a clear "Новый чат" call-to-action linking to `/agents/chat` (the web analog of desktop's "land in chat"). Pure JSX + `next/link`.

**Files:**
- Modify: `apps/web/src/app/(agents)/components/AgentsCabinet/AgentsCabinet.tsx`

- [ ] **Step 1: Add a `MessageSquarePlus` icon to the existing lucide import**

Change the lucide import block:

```tsx
import {
	Activity,
	ArrowRight,
	BrainCircuit,
	Clock3,
	Database,
	Hash,
	Terminal,
} from "lucide-react";
```

to (insert `MessageSquarePlus`, keep alphabetical-ish order consistent):

```tsx
import {
	Activity,
	ArrowRight,
	BrainCircuit,
	Clock3,
	Database,
	Hash,
	MessageSquarePlus,
	Terminal,
} from "lucide-react";
```

- [ ] **Step 2: Add the "Новый чат" action next to "Открыть последнюю сессию"**

In the hero `<section>`, change the action area that currently renders only the optional "Открыть последнюю сессию" button:

```tsx
					{topSession && (
						<Button asChild variant="outline">
							<Link href={topSession.href}>
								Открыть последнюю сессию
								<ArrowRight className="size-4" />
							</Link>
						</Button>
					)}
```

to (wrap both buttons; the new chat button is always shown):

```tsx
					<div className="flex flex-wrap items-center gap-2">
						<Button asChild>
							<Link href="/agents/chat">
								<MessageSquarePlus className="size-4" />
								Новый чат
							</Link>
						</Button>
						{topSession && (
							<Button asChild variant="outline">
								<Link href={topSession.href}>
									Открыть последнюю сессию
									<ArrowRight className="size-4" />
								</Link>
							</Button>
						)}
					</div>
```

- [ ] **Step 3: Typecheck web**

Run: `bunx turbo typecheck --filter=@rox/web`
Expected: PASS.

- [ ] **Step 4: Lint + commit**

```bash
bun run lint:fix
bun run lint < /dev/null
git add "apps/web/src/app/(agents)/components/AgentsCabinet/AgentsCabinet.tsx"
git commit -m "feat(web/chat): add 'Новый чат' entry on AgentsCabinet linking to /agents/chat"
```

---

## BLOCK E — Web voice in the chat composer

### Task E1: Replace the stub `PreviewPromptComposer` submit with a real `onSubmit`

`PreviewPromptComposer` is currently a hard-disabled preview (empty `handleSubmit`, `disabled` textarea + submit). Parametrize it with an optional working mode: an `onSubmit` prop, an `enabled` flag that un-disables the textarea/submit, and an optional `footerExtras` slot (for the mic). When `onSubmit` is omitted it stays a read-only preview (existing `AgentPromptInput` / `FollowUpInput` consumers are unchanged). This keeps one composer component and avoids forking.

**Files:**
- Modify: `apps/web/src/app/(agents)/components/PreviewPromptComposer/PreviewPromptComposer.tsx`

- [ ] **Step 1: Widen the props and wire the working path**

Replace the entire file `apps/web/src/app/(agents)/components/PreviewPromptComposer/PreviewPromptComposer.tsx` with:

```tsx
"use client";

import {
	PromptInput,
	PromptInputAttachment,
	PromptInputAttachments,
	PromptInputFooter,
	PromptInputHeader,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTextarea,
	PromptInputTools,
} from "@rox/ui/ai-elements/prompt-input";
import { cn } from "@rox/ui/utils";
import { ArrowUpIcon } from "lucide-react";
import { type ReactNode, useCallback } from "react";
import { MAX_FILE_SIZE, MAX_FILES } from "../../constants";
import { PlusMenu } from "../PlusMenu";

type PreviewPromptComposerProps = {
	placeholder: string;
	promptInputClassName: string;
	footerTools: ReactNode;
	containerClassName?: string;
	footerToolsClassName?: string;
	afterComposer?: ReactNode;
	header?: ReactNode;
	message?: string;
	messageClassName?: string;
	/**
	 * When provided, the composer is interactive: textarea + submit are enabled
	 * and submitting calls this. When omitted, the composer stays a read-only
	 * preview (the default for the agent-session prototype).
	 */
	onSubmit?: (message: PromptInputMessage) => void;
	/** Extra footer controls rendered left of submit (e.g. a mic button). */
	footerExtras?: ReactNode;
	/** Submit busy/disabled state for the interactive mode. */
	submitDisabled?: boolean;
};

export function PreviewPromptComposer({
	placeholder,
	promptInputClassName,
	footerTools,
	containerClassName,
	footerToolsClassName,
	afterComposer,
	header,
	message = "Веб-интерфейс агентов пока доступен только для просмотра.",
	messageClassName,
	onSubmit,
	footerExtras,
	submitDisabled,
}: PreviewPromptComposerProps) {
	const interactive = typeof onSubmit === "function";
	const noop = useCallback(() => {}, []);

	return (
		<div className={cn(containerClassName)}>
			<PromptInput
				onSubmit={onSubmit ?? noop}
				className={promptInputClassName}
				multiple
				maxFiles={MAX_FILES}
				maxFileSize={MAX_FILE_SIZE}
			>
				<PromptInputAttachments>
					{(file) => <PromptInputAttachment key={file.id} data={file} />}
				</PromptInputAttachments>
				{header ? <PromptInputHeader>{header}</PromptInputHeader> : null}
				<PromptInputTextarea
					disabled={!interactive}
					placeholder={placeholder}
					className="min-h-10"
				/>
				<PromptInputFooter>
					<PromptInputTools className={cn(footerToolsClassName)}>
						{footerTools}
					</PromptInputTools>
					<div className="flex items-center gap-2">
						<PlusMenu disabled={!interactive} />
						{footerExtras}
						<PromptInputSubmit
							disabled={!interactive || submitDisabled}
							className="size-[23px] rounded-full border border-transparent bg-foreground/10 p-[5px] shadow-none hover:bg-foreground/20"
						>
							<ArrowUpIcon className="size-3.5 text-muted-foreground" />
						</PromptInputSubmit>
					</div>
				</PromptInputFooter>
			</PromptInput>
			{afterComposer}
			{message ? <p className={messageClassName}>{message}</p> : null}
		</div>
	);
}
```

> Changes vs original: added `onSubmit?`, `footerExtras?`, `submitDisabled?`; `disabled` on textarea/submit/PlusMenu now derives from `interactive`; the trailing preview `message` only renders when non-empty (the working chat passes `message=""`). Existing read-only consumers (`AgentPromptInput`, `FollowUpInput`) pass no `onSubmit`, so they keep the disabled preview behavior byte-for-byte. `PromptInputMessage` is already exported from `@rox/ui/ai-elements/prompt-input` (desktop imports it the same way).

- [ ] **Step 2: Typecheck web**

Run: `bunx turbo typecheck --filter=@rox/web`
Expected: PASS (additive optional props; existing call sites compile unchanged).

- [ ] **Step 3: Lint + commit**

```bash
bun run lint:fix
bun run lint < /dev/null
git add "apps/web/src/app/(agents)/components/PreviewPromptComposer/PreviewPromptComposer.tsx"
git commit -m "feat(web): make PreviewPromptComposer interactive via optional onSubmit + footerExtras"
```

---

### Task E2: Mount the shared `MicButton` + the real composer in `WebQuickChatView`

Swap the temporary plain textarea (Task D3) for the shared `PreviewPromptComposer` running in interactive mode, with the `@rox/ui/voice` `MicButton` in `footerExtras`. Transcription goes through `trpcClient.voice.transcribe.mutate(...)`; the result is inserted via `usePromptInputController().textInput`. The composer's `onSubmit` drives the same `send()` loop. Because `usePromptInputController` must be called inside the `PromptInputProvider` that `PromptInput` mounts, the composer body is split into a small inner component that lives under the provider.

**Files:**
- Modify: `apps/web/src/app/(agents)/chat/components/WebQuickChatView/WebQuickChatView.tsx`

- [ ] **Step 1: Replace the input area with the shared composer + mic**

In `WebQuickChatView.tsx`:

(a) Update imports — drop the plain `Button`/`Textarea`/`LuArrowUp` input pieces (keep `LuLoaderCircle`, `LuSparkles` for the message list), and add the composer + voice + controller imports:

```tsx
"use client";

import { ROX_CHAT_MODEL, ROX_CHAT_MODEL_NAME } from "@rox/shared/chat-models";
import {
	type PromptInputMessage,
	usePromptInputController,
} from "@rox/ui/ai-elements/prompt-input";
import { cn } from "@rox/ui/utils";
import { toast } from "@rox/ui/sonner";
import { blobToBase64, MicButton, type Recording } from "@rox/ui/voice";
import { useCallback, useRef, useState } from "react";
import { LuLoaderCircle, LuSparkles } from "react-icons/lu";
import { trpcClient } from "@/trpc/client";
import { PreviewPromptComposer } from "../../../components/PreviewPromptComposer";
import { deriveQuickChatReply } from "../../utils/deriveQuickChatReply";
```

(b) Change the `send` signature to take the submitted text (the composer owns the input value now) instead of reading a local `input` state. Replace the `send` callback and the `input` state:

- Remove `const [input, setInput] = useState("");`.
- Replace the `send` callback body's first lines:

```tsx
	const send = useCallback(async () => {
		const text = input.trim();
		if (text.length === 0 || isSending) return;
```

with:

```tsx
	const send = useCallback(
		async (rawText: string) => {
			const text = rawText.trim();
			if (text.length === 0 || isSending) return;
```

- Remove the `setInput("");` line inside `send` (the composer clears itself on submit).
- Update the `send` dependency array + closing to match the new signature:

```tsx
		},
		[isSending, messages, scrollToBottom],
	);
```

(c) Replace the entire input `<div className="border-t border-border px-6 py-4"> … </div>` block at the bottom with the composer mounted in interactive mode:

```tsx
			<div className="border-t border-border px-6 py-4">
				<div className="mx-auto w-full max-w-2xl">
					<PreviewPromptComposer
						containerClassName="rounded-xl border border-border bg-card p-1"
						promptInputClassName="[&>[data-slot=input-group]]:rounded-[13px] [&>[data-slot=input-group]]:border-none [&>[data-slot=input-group]]:shadow-none [&>[data-slot=input-group]]:bg-transparent"
						placeholder="Напишите сообщение…"
						footerTools={
							<span className="text-xs text-muted-foreground">
								{ROX_CHAT_MODEL_NAME}
							</span>
						}
						message=""
						submitDisabled={isSending}
						onSubmit={(submitted: PromptInputMessage) => {
							void send(submitted.text ?? "");
						}}
						footerExtras={
							<WebMicButton
								disabled={isSending}
								onTranscribed={(text) => {
									// inserted into the composer below via the controller
									insertRef.current?.(text);
								}}
							/>
						}
					/>
				</div>
			</div>
```

> Important: `WebMicButton` and the transcript insertion must run **inside** the `PromptInputProvider` that `PromptInput` creates. The simplest correct wiring is to make the mic itself the controller consumer. Use the inner-component approach below instead of an `insertRef`.

(d) Add an inner `WebMicButton` component (same file, below `WebQuickChatView`) that is rendered *inside* the composer (so it sits under the provider) and does both the transcription call and the insertion via the controller:

```tsx
function WebMicButton({
	disabled,
}: {
	disabled?: boolean;
}) {
	const { textInput } = usePromptInputController();
	const [transcribing, setTranscribing] = useState(false);

	const handleComplete = useCallback(
		async (recording: Recording, locked: boolean) => {
			setTranscribing(true);
			try {
				const audioBase64 = await blobToBase64(recording.blob);
				const result = await trpcClient.voice.transcribe.mutate({
					audioBase64,
					mimeType: recording.mimeType,
					durationMs: recording.durationMs,
				});
				const text = (result.processed?.ru || result.rawText || "").trim();
				if (!text) {
					toast.info("Не удалось распознать речь");
					return;
				}
				// Web has no push-to-talk auto-send: always insert for review.
				// `locked` is ignored here (kept in the signature for parity).
				void locked;
				const prev = textInput.value;
				textInput.setInput(prev ? `${prev} ${text}` : text);
				textInput.focus();
			} catch {
				toast.error("Ошибка расшифровки — запись сохранена для повтора");
			} finally {
				setTranscribing(false);
			}
		},
		[textInput],
	);

	return (
		<MicButton
			onComplete={handleComplete}
			transcribing={transcribing}
			disabled={disabled}
		/>
	);
}
```

Then in the composer JSX from (c), simplify `footerExtras` to just the self-contained mic (remove the `insertRef` comment/approach):

```tsx
						footerExtras={<WebMicButton disabled={isSending} />}
```

> Rationale: `usePromptInputController()` throws unless it is under `PromptInputProvider`. `PromptInput` (inside `PreviewPromptComposer`) provides that context, and `footerExtras` is rendered within `PromptInputFooter` → inside `PromptInput` → under the provider. So `WebMicButton` resolves the controller correctly. This mirrors how the desktop `ChatInputFooter` reads `usePromptInputController().textInput`. No mic hotkey on web (we pass no `onReady`), per spec.

- [ ] **Step 2: Typecheck web**

Run: `bunx turbo typecheck --filter=@rox/web`
Expected: PASS.

- [ ] **Step 3: Lint + commit**

```bash
bun run lint:fix
bun run lint < /dev/null
git add "apps/web/src/app/(agents)/chat/components/WebQuickChatView/WebQuickChatView.tsx"
git commit -m "feat(web/voice): mount shared MicButton in web chat; transcribe via trpcClient.voice"
```

---

### Task E3: Block D+E verification + manual run

**Files:** none (verification only).

- [ ] **Step 1: Run the web pure-function tests**

```bash
bun test "apps/web/src/app/(agents)/chat/utils/deriveQuickChatReply/deriveQuickChatReply.test.ts"
```
Expected: PASS.

- [ ] **Step 2: Typecheck web + lint**

```bash
bunx turbo typecheck --filter=@rox/web
bun run lint < /dev/null
```
Expected: PASS / exit 0.

- [ ] **Step 3: Manual run (the part unit tests can't cover)**

Start web dev with a secure context (`getUserMedia` needs HTTPS or localhost). Prefer portless: `portless web bun run dev --filter=@rox/web` → `https://web.t` (or run the desktop-excluded dev set from AGENTS.md and use the `WEB_PORT` localhost URL). Sign in as Local Admin (dev). Then:

1. **New chat entry:** on `/agents` the cabinet shows a **"Новый чат"** button → click it → lands on `/agents/chat` with the empty-state ("Чем помочь?") and a focusable composer.
2. **Text chat:** type a message + Enter (or click submit) → a "ROX R1 печатает…" indicator → a reply bubble appears. With `ROX_AI_API_KEY` set you get a real answer; unset → the soft "Модель пока недоступна" notice (proves graceful `not-configured`).
3. **Voice:** click/hold the mic (grant the browser mic permission once) → waveform overlay → release/confirm → after transcription the recognized text is **inserted into the composer** for review (not auto-sent), cursor focused. Submit sends it.

- [ ] **Step 4: Capture Playwright/Peekaboo evidence**

Capture the running web app: (a) the cabinet with the "Новый чат" button, (b) `/agents/chat` after a successful text exchange, (c) the composer showing the mic + an inserted transcription. Save under the project evidence location and reference in the PR. (Voice requires the secure-context note above.)

---

## Final verification task: full gate across all three packages

**Files:** none (verification only).

- [ ] **Step 1: Run every moved/added test**

```bash
bun test packages/ui/src/voice/blobToBase64/blobToBase64.test.ts
bun test packages/ui/src/voice/canStartDictation/canStartDictation.test.ts
bun test "apps/web/src/app/(agents)/chat/utils/deriveQuickChatReply/deriveQuickChatReply.test.ts"
```
Expected: all PASS.

- [ ] **Step 2: Typecheck the three packages together**

```bash
bunx turbo typecheck --filter=@rox/desktop --filter=@rox/web --filter=@rox/ui
```
Expected: PASS for all three. Proves the shared core extraction kept desktop green, web compiles against the new chat + voice, and `@rox/ui` is self-contained.

- [ ] **Step 3: Lint the whole repo**

```bash
bun run lint < /dev/null
```
Expected: exit 0, no output (CI treats warnings as errors — run `bun run lint:fix` first if needed).

- [ ] **Step 4: Confirm the shared core has zero desktop/transport coupling**

```bash
grep -rn "renderer/\|react-hotkeys-hook\|electron\|@rox/chat\|@trpc/" packages/ui/src/voice
```
Expected: no output.

- [ ] **Step 5: Push / open PR (per git policy)**

```bash
git push -u origin feat/voice-everywhere-instant-chat
gh pr create --fill
```

> The desktop plan (`plans/2026-06-23-voice-and-instant-chat-phase1-desktop.md`) and this plan share the branch `feat/voice-everywhere-instant-chat`. If both are executed, land their commits on the same branch and open one PR covering A+B+C+D+E.

---

## Self-review (coverage vs spec)

Spec: `docs/superpowers/specs/2026-06-23-voice-everywhere-and-instant-chat-design.md`.

- **Block A — shared voice core** → Tasks A1 (`blobToBase64` shared, TDD), A2 (`canStartDictation` moved, TDD, desktop copy deleted), A3 (`useDictation` moved + desktop re-export), A4 (`MicButton`+`WaveformOverlay` moved, **hotkey parametrized out via `onReady`**, `@rox/ui/voice` export added), A5 (desktop encoder re-pointed + deleted), A6 (desktop `DICTATE` hotkey wired at the edge), A7 (dead `PromptInputSpeechButton` deleted), A8 (Block A gate: desktop green). ✓
  - Spec "убрать `import { useHotkey }` из `MicButton`; хоткей передавать опционально" → A4 removes the import; the toggle is injected via `onReady` and bound by `useHotkey("DICTATE", …)` at the desktop edge in A6. `packages/ui` has ZERO `renderer/*`/hotkey/tRPC imports (asserted in A8 Step 3 + final Step 4). ✓
  - Spec "ядро НЕ импортирует tRPC-клиент; `MicButton` отдаёт `Recording` в `onComplete`" → preserved; transcription stays at the edges (desktop `ChatInputFooter`, web `WebMicButton`). ✓
  - Spec "Удалить мёртвый код `PromptInputSpeechButton`" → A7. ✓
- **Block D — web quick chat** → Tasks D1 (`ROX_AI_API_KEY` documented, names only; `GROQ_API_KEY` already present), D2 (`deriveQuickChatReply` status mapper, TDD), D3 (`WebQuickChatView` copying the desktop `QuickChatView` pattern: local `useState` messages, `sessionId` via `crypto.randomUUID()` ref, `trpcClient.chat.complete.mutate`, `status: ok|needs-user-key|not-configured` via the tested mapper), D4 (`/agents/chat` route), D5 ("Новый чат" entry on `AgentsCabinet`). Quick LLM chat, NOT the agent-coder. ✓
- **Block E — web voice** → Tasks E1 (un-stub `PreviewPromptComposer` with optional interactive `onSubmit` + `footerExtras`, read-only consumers unchanged), E2 (mount `@rox/ui/voice` `MicButton`; `onComplete -> trpcClient.voice.transcribe.mutate({audioBase64,mimeType,durationMs})`; insert via `usePromptInputController().textInput`; mic lives under the composer's `PromptInputProvider`; no web hotkey). Secure-context (HTTPS/localhost) note carried in E3 Step 3. ✓
- **Verification** → final task runs the exact requested commands: `bunx turbo typecheck --filter=@rox/desktop --filter=@rox/web --filter=@rox/ui`, `bun run lint < /dev/null`, and the moved voice tests (+ the new web test). ✓
- **TDD coverage:** pure functions get tests first — `blobToBase64` (A1), `canStartDictation` (A2), `deriveQuickChatReply` (D2). UI wiring (MicButton move, composer, route, cabinet entry) is verified by typecheck + lint + explicit manual-check notes, since it has no pure core. ✓
- **Risks carried from spec:**
  - *Desktop dictation regression* (A touches working desktop code) → behavior parity argued in A4 Step 3; desktop typecheck (A6/A8) + manual dictation run (A8 Step 4) gate it.
  - *Web chat expectations* → it is the non-streaming `chat.complete` quick chat (full reply at once), not the agent-coder; copy + notices make this explicit.
  - *Server env* → `GROQ_API_KEY` (voice) + `ROX_AI_API_KEY` (chat) documented names-only; both features degrade softly when unset (mic disabled via `voice.isConfigured` from the desktop plan / `not-configured` notice).
  - *Secure context for `getUserMedia`* → E3 Step 3 mandates HTTPS/localhost (portless `https://web.t`).
- **Type/name consistency across tasks:** `@rox/ui/voice` exports (`blobToBase64`, `canStartDictation`, `MicButton`, `MicButtonProps`, `MicButtonControls`, `WaveformOverlay`, `useDictation`, `Recording`, `DictationState`, `UseDictation`, `UseDictationOptions`); `ChatCompleteOutput` from `@rox/trpc`; `PromptInputMessage` + `usePromptInputController().textInput` (`value`/`setInput`/`focus`) used identically on web + desktop. ✓
- **Ordering caveat:** A3/A5 reference `@rox/ui/voice`, which is created (export entry + barrel) in A4 — apply A1→A8 in order within the branch (the notes flag the cross-task dependency). D2's `WebQuickChatView` (D3) and the route (D4) precede the cabinet link (D5); E1 (composer) precedes E2 (mic mount).
