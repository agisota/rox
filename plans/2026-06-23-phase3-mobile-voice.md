# Phase 3 — Mobile voice dictation into CreateTaskSheet

Date: 2026-06-23 · Scope: **mobile only** (`apps/mobile`) · Branch: continue on the active `feat/voice-everywhere-instant-chat` branch (Phase-1 desktop+web already landing on it)

> Companion to `docs/superpowers/specs/2026-06-23-voice-everywhere-and-instant-chat-design.md` (Phase-3 / mobile section, lines 12, 16, 31, 80-81, 99). This plan implements ONLY the mobile slice of that spec.

---

## Goal

Let a signed-in mobile user dictate the **description** of a new task by holding a mic button inside `CreateTaskSheet`. On release, the clip is transcribed server-side (the existing `voice.transcribe` tRPC procedure, shared Groq Whisper key) and the result is dropped into the description `Textarea`. No agent chat screen exists in mobile and **none is built** — the only host surface for voice on mobile is `CreateTaskSheet`.

Definition of done:
- Holding the mic records; releasing stops and transcribes; the transcript appears in the description field.
- Mic permission is requested on first use and a denial is handled gracefully (no crash, a visible hint).
- The pure helper (mime/duration formatter) has a passing co-located `bun:test`.
- `bunx turbo typecheck --filter=@rox/mobile` and `bun run lint < /dev/null` are clean.
- Honest gap stated: runtime audio proof requires a dev-client rebuild on a simulator/device and is **not** covered by typecheck/lint.

## Architecture

```
CreateTaskSheet  (apps/mobile/.../tasks/components/CreateTaskSheet/CreateTaskSheet.tsx)
  description: useState  ──────────────────────────────┐
        ▲                                               │ setDescription(text)
        │ <MicButton onComplete={...}/>  (near Textarea)│
        │                                               │
  apps/mobile/components/voice/MicButton/MicButton.tsx  │  (RN-native: Pressable + lucide Mic + ActivityIndicator)
        │ press-in → start · press-out → stop           │
        ▼                                               │
  apps/mobile/lib/voice/useDictation/useDictation.ts    │  (expo-audio: useAudioRecorder + RecordingPresets.HIGH_QUALITY)
        │ recorder.uri (file://, .m4a/AAC)              │
        ▼                                               │
  apps/mobile/lib/voice/audioToBase64.ts                │  (expo-file-system: new File(uri).base64())
        │ bare base64                                   │
        ▼                                               │
  apiClient.voice.transcribe.mutate({ audioBase64, mimeType:"audio/m4a", durationMs })
        │  (apps/mobile/lib/trpc/client.ts → AppRouter)  │
        ▼                                               │
  { rawText, processed } ──→ processed?.ru || rawText ──┘
        │
  packages/trpc voice.transcribe (shared backend, Groq Whisper, server GROQ_API_KEY)
```

Boundary rule (verified): the web/desktop dictation core in `packages/ui/src/voice/**` is **browser-DOM only** (`MediaRecorder`, `navigator.mediaDevices.getUserMedia`, `window.AudioContext`, DOM `<button>`, pointer capture, `lucide-react`). It **cannot** be imported into React Native. Mobile builds its own recorder, base64, and button; the **only** shared element is the backend call `apiClient.voice.transcribe.mutate(...)` and the response handling (`processed?.ru || rawText`), mirroring desktop. The `Recording` shape and the push-to-talk concept from `useDictation.ts` are a behavioral reference only — every line is rewritten for RN.

## Tech Stack

- **Expo SDK 56** (`expo` `56.0.3`), **React Native 0.85.3**, **React 19.2.3**.
- **expo-audio** (to be installed via `bunx expo install`; SDK-56-compatible version auto-resolved) — recording.
- **expo-file-system** `56.0.7` (already installed; new File API) — `new File(uri).base64()`.
- **lucide-react-native** `0.562.0` (already installed) — `Mic` icon via the repo `Icon` wrapper.
- **@trpc/client** `11.16.0` vanilla proxy client (`apiClient`, already wired to `AppRouter`).
- Package manager **Bun**; tests via `bun:test`; lint/format **Biome** at repo root.
- Mobile structure rule (`apps/mobile/AGENTS.md`): routing in `app/`, UI/logic in `screens/`. The new voice code is shared mobile infra → it lives under `apps/mobile/lib/voice/**` and `apps/mobile/components/voice/**` (sibling to the existing `apps/mobile/lib/trpc`, `apps/mobile/components/ui`).

### Pre-flight facts (verified against the working tree on 2026-06-23)

- `CreateTaskSheet.tsx` **exists** at `apps/mobile/screens/(authenticated)/(tasks)/tasks/components/CreateTaskSheet/CreateTaskSheet.tsx` and already holds `description` / `setDescription` state (lines 33, 74) plus a `<Textarea>` for the description — this is the mount point. (The original facts pack predated this file; it has since landed.)
- `apps/mobile/components/ui/icon.tsx` exports `Icon` with signature `<Icon as={LucideIcon} className=... />` (uniwind). Use it for the mic glyph.
- `apps/mobile/lib/trpc/client.ts` exports `apiClient = createTRPCProxyClient<AppRouter>(...)` → `apiClient.voice.transcribe.mutate(...)` is directly callable (auth via better-auth cookie header).
- `packages/trpc/src/router/voice/voice.ts:22-30` — `transcribe` input: `audioBase64: z.string().min(1).max(15_000_000)`, `mimeType: z.string().default("audio/webm")` (free-form, no whitelist — `.m4a`/AAC accepted), `durationMs: z.number().int().nonnegative().optional()`, `postprocess: z.boolean().default(true)`. Returns `{ id, rawText, language, processed: { ru, en } | null }`.
- `apps/mobile/app.config.ts` currently has `plugins: ["expo-router", "expo-localization"]`, `ios.infoPlist` only `{ ITSAppUsesNonExemptEncryption: false }`, and **no** Android `permissions`. No native `android/`/`ios/` folders → managed/CNG prebuild; a **dev-client rebuild** is required after any native permission change.
- Existing co-located test style: `buildCreateTaskInput.test.ts` uses `import { describe, expect, test } from "bun:test"`. T3's helper test follows the same form.

---

## Tasks

Each task is independently verifiable. Run the commands from the **repo root** unless stated. The executing engineer commits after each task with the provided message (this planning agent does not commit).

---

### T1 — Install `expo-audio`

**Why:** RN has no `MediaRecorder`; `expo-audio` is the SDK-56 recording API. `expo install` resolves the version compatible with `expo@56.0.3` (do not hand-pin).

**Command (run inside `apps/mobile`):**

```bash
cd apps/mobile && bunx expo install expo-audio
```

This edits `apps/mobile/package.json` (adds `expo-audio` to `dependencies`) and updates the root `bun.lock`. Do **not** edit those files by hand.

**Verify:**

```bash
grep -n "expo-audio" apps/mobile/package.json
ls apps/mobile/node_modules/expo-audio/package.json
```

Both must succeed (the dep line is present and the package is installed).

**Commit:**

```bash
git add apps/mobile/package.json bun.lock
git commit -m "feat(mobile): add expo-audio for voice dictation recording"
```

---

### T2 — Microphone permissions in `app.config.ts`

**Why:** iOS needs `NSMicrophoneUsageDescription` (app is rejected/crashes without it); Android needs `RECORD_AUDIO`. The `expo-audio` config plugin sets the iOS string and the Android permission at prebuild; we ALSO add the explicit `infoPlist`/`permissions` entries (belt-and-suspenders, harmless). These are native changes → **a dev-client rebuild is required**; JS/OTA reload will not pick them up.

**Edit** `apps/mobile/app.config.ts`.

Replace the `ios` block:

```ts
	ios: {
		supportsTablet: true,
		bundleIdentifier: "sh.rox.mobile",
		infoPlist: {
			ITSAppUsesNonExemptEncryption: false,
		},
	},
```

with:

```ts
	ios: {
		supportsTablet: true,
		bundleIdentifier: "sh.rox.mobile",
		infoPlist: {
			ITSAppUsesNonExemptEncryption: false,
			NSMicrophoneUsageDescription:
				"Rox uses the microphone to dictate task titles and descriptions.",
		},
	},
```

Replace the `android` block:

```ts
	android: {
		adaptiveIcon: {
			foregroundImage: "./assets/adaptive-icon.png",
			backgroundColor: "#ffffff",
		},
		package: "sh.rox.mobile",
		predictiveBackGestureEnabled: false,
	},
```

with:

```ts
	android: {
		adaptiveIcon: {
			foregroundImage: "./assets/adaptive-icon.png",
			backgroundColor: "#ffffff",
		},
		package: "sh.rox.mobile",
		predictiveBackGestureEnabled: false,
		permissions: ["android.permission.RECORD_AUDIO"],
	},
```

Replace the `plugins` line:

```ts
	plugins: ["expo-router", "expo-localization"],
```

with:

```ts
	plugins: [
		"expo-router",
		"expo-localization",
		[
			"expo-audio",
			{
				microphonePermission:
					"Rox uses the microphone to dictate task titles and descriptions.",
			},
		],
	],
```

**Verify (static — config evaluates and contains the entries):**

```bash
cd apps/mobile && bunx expo config --type public --json \
  | grep -E "NSMicrophoneUsageDescription|RECORD_AUDIO"
```

Both strings must appear. (If `expo config` is unavailable offline, fall back to a grep of the edited file: `grep -nE "NSMicrophoneUsageDescription|RECORD_AUDIO|expo-audio" apps/mobile/app.config.ts`.)

**NOT auto-verifiable:** the permission only takes effect after a dev-client rebuild (`bunx expo run:ios` / `bunx expo run:android`, or an EAS dev build). Note this in the commit body; do not claim runtime mic access from this step.

**Commit:**

```bash
git add apps/mobile/app.config.ts
git commit -m "feat(mobile): declare microphone permission for voice dictation

iOS NSMicrophoneUsageDescription + Android RECORD_AUDIO via expo-audio
config plugin and explicit infoPlist/permissions. Requires a dev-client
rebuild to take effect on device/simulator."
```

---

### T3 — Recorder adapter + base64 helper (with a tested pure core)

Three new files under `apps/mobile/lib/voice/`. The recorder hook and the base64 reader wrap native modules (not unit-tested here); the **pure** `formatRecordingMeta` helper is unit-tested with `bun:test`, giving the slice a tested core per repo convention.

#### T3a — `apps/mobile/lib/voice/audioToBase64.ts`

RN replacement for the web `blobToBase64` (`Blob`/`btoa` don't exist in RN). Uses the new `expo-file-system` File API: `new File(uri).base64()` returns a **bare** base64 string (no `data:` prefix) — exactly what `voice.transcribe` wants.

```ts
import { File } from "expo-file-system";

/**
 * Read a recorded audio file (a `file://` URI from expo-audio) as bare base64.
 *
 * RN has no `Blob`/`btoa`, so the desktop `blobToBase64` cannot be reused. The
 * new expo-file-system File API exposes `base64()` which returns the file
 * contents as a base64 string with no `data:` prefix — the exact shape the
 * `voice.transcribe` tRPC input (`audioBase64`) expects.
 */
export async function audioToBase64(fileUri: string): Promise<string> {
	return new File(fileUri).base64();
}
```

#### T3b — `apps/mobile/lib/voice/useDictation/formatRecordingMeta.ts` (pure, tested)

A small pure helper that normalizes the recorder output into the `voice.transcribe` argument shape (rounds the duration to a non-negative int, since the input is `z.number().int().nonnegative()`, and clamps a sane mime). Keeping it pure makes the contract unit-testable without native modules.

```ts
/** Mime type expo-audio's HIGH_QUALITY preset produces on iOS/Android. */
export const MOBILE_AUDIO_MIME = "audio/m4a";

export interface RecordingMeta {
	mimeType: string;
	durationMs: number;
}

/**
 * Normalize raw recorder output into the `voice.transcribe` argument shape.
 *
 * Pure (no native deps) so the contract is unit-testable. The server input is
 * `durationMs: z.number().int().nonnegative().optional()`, so we round to a
 * non-negative integer; a missing/NaN/negative duration collapses to 0.
 */
export function formatRecordingMeta(
	durationMillis: number | null | undefined,
	mimeType: string = MOBILE_AUDIO_MIME,
): RecordingMeta {
	const raw = typeof durationMillis === "number" ? durationMillis : 0;
	const durationMs = Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 0;
	return { mimeType: mimeType || MOBILE_AUDIO_MIME, durationMs };
}
```

#### T3c — `apps/mobile/lib/voice/useDictation/formatRecordingMeta.test.ts` (co-located)

```ts
import { describe, expect, test } from "bun:test";
import { formatRecordingMeta, MOBILE_AUDIO_MIME } from "./formatRecordingMeta";

describe("formatRecordingMeta", () => {
	test("rounds a fractional duration and keeps the default mime", () => {
		expect(formatRecordingMeta(1234.7)).toEqual({
			mimeType: MOBILE_AUDIO_MIME,
			durationMs: 1235,
		});
	});

	test("collapses null/undefined/NaN/negative duration to 0", () => {
		expect(formatRecordingMeta(null).durationMs).toBe(0);
		expect(formatRecordingMeta(undefined).durationMs).toBe(0);
		expect(formatRecordingMeta(Number.NaN).durationMs).toBe(0);
		expect(formatRecordingMeta(-50).durationMs).toBe(0);
	});

	test("passes a custom mime through, falling back when empty", () => {
		expect(formatRecordingMeta(10, "audio/mp4").mimeType).toBe("audio/mp4");
		expect(formatRecordingMeta(10, "").mimeType).toBe(MOBILE_AUDIO_MIME);
	});
});
```

#### T3d — `apps/mobile/lib/voice/useDictation/useDictation.ts`

The RN recorder hook. Wraps `expo-audio` `useAudioRecorder` + `useAudioRecorderState`. Requests mic permission on first `start()`, sets the iOS audio session, records to `.m4a`, and on `stop()` reads the file → base64 → fires `onComplete({ audioBase64, mimeType, durationMs })`. Tap-to-start / tap-to-stop (the two-gesture PTT/lock model from the web core is intentionally out of scope for v1; the MicButton in T4 uses a simple press-and-hold instead).

```ts
import {
	AudioModule,
	RecordingPresets,
	setAudioModeAsync,
	useAudioRecorder,
	useAudioRecorderState,
} from "expo-audio";
import { useCallback, useRef, useState } from "react";
import { audioToBase64 } from "../audioToBase64";
import { formatRecordingMeta } from "./formatRecordingMeta";

export type MobileDictationState =
	| "idle"
	| "requesting"
	| "recording"
	| "transcribing"
	| "error";

export interface MobileRecording {
	audioBase64: string;
	mimeType: string;
	durationMs: number;
}

export interface UseMobileDictationOptions {
	/** Fired after a recording is stopped, read, and encoded to base64. */
	onComplete?: (recording: MobileRecording) => void;
	/** Ignore clips shorter than this (ms). */
	minDurationMs?: number;
}

export interface UseMobileDictation {
	state: MobileDictationState;
	isRecording: boolean;
	durationMs: number;
	error: string | null;
	start: () => Promise<void>;
	stop: () => Promise<void>;
}

/**
 * Mobile dictation recorder (expo-audio). RN-native replacement for the
 * browser-only `@rox/ui` `useDictation` (which relies on MediaRecorder /
 * getUserMedia / AudioContext and cannot run in React Native).
 *
 * Flow: start() → request mic permission (once) → set iOS audio mode → record
 * to .m4a; stop() → read the file as base64 → onComplete(). The encode step is
 * surfaced as the `transcribing` state so the button can show a spinner while
 * the file is read and (by the host) sent to `voice.transcribe`.
 */
export function useMobileDictation(
	options: UseMobileDictationOptions = {},
): UseMobileDictation {
	const { onComplete, minDurationMs = 400 } = options;

	const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
	const recorderState = useAudioRecorderState(recorder);

	const [state, setState] = useState<MobileDictationState>("idle");
	const [error, setError] = useState<string | null>(null);
	const startedAtRef = useRef(0);

	const start = useCallback(async () => {
		if (state === "recording" || state === "requesting") return;
		setError(null);
		setState("requesting");
		try {
			const permission = await AudioModule.requestRecordingPermissionsAsync();
			if (!permission.granted) {
				setState("error");
				setError("Нет доступа к микрофону");
				return;
			}
			// Required so iOS actually records (and records in silent mode).
			await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
			await recorder.prepareToRecordAsync();
			startedAtRef.current = Date.now();
			recorder.record();
			setState("recording");
		} catch {
			setState("error");
			setError("Не удалось начать запись");
		}
	}, [recorder, state]);

	const stop = useCallback(async () => {
		if (state !== "recording") return;
		setState("transcribing");
		try {
			await recorder.stop();
			const uri = recorder.uri;
			const elapsed = Date.now() - startedAtRef.current;
			const durationSource =
				typeof recorderState.durationMillis === "number" &&
				recorderState.durationMillis > 0
					? recorderState.durationMillis
					: elapsed;

			if (!uri || durationSource < minDurationMs) {
				setState("idle");
				return;
			}

			const audioBase64 = await audioToBase64(uri);
			if (!audioBase64) {
				setState("idle");
				return;
			}
			const meta = formatRecordingMeta(durationSource);
			setState("idle");
			onComplete?.({ audioBase64, ...meta });
		} catch {
			setState("error");
			setError("Не удалось обработать запись");
		}
	}, [
		recorder,
		recorderState.durationMillis,
		state,
		minDurationMs,
		onComplete,
	]);

	return {
		state,
		isRecording: state === "recording" || recorderState.isRecording === true,
		durationMs: recorderState.durationMillis ?? 0,
		error,
		start,
		stop,
	};
}
```

#### Barrels

`apps/mobile/lib/voice/useDictation/index.ts`:

```ts
export {
	type MobileDictationState,
	type MobileRecording,
	type UseMobileDictation,
	type UseMobileDictationOptions,
	useMobileDictation,
} from "./useDictation";
export {
	formatRecordingMeta,
	MOBILE_AUDIO_MIME,
	type RecordingMeta,
} from "./formatRecordingMeta";
```

**Verify:**

```bash
bun test "apps/mobile/screens/(authenticated)/(tasks)/tasks/components/CreateTaskSheet/buildCreateTaskInput.test.ts" apps/mobile/lib/voice/useDictation/formatRecordingMeta.test.ts
```

The `formatRecordingMeta` suite (3 tests) must pass. (Including the existing CreateTaskSheet test in the same run confirms the bun:test runner sees the new file.)

**Commit:**

```bash
git add apps/mobile/lib/voice
git commit -m "feat(mobile): add expo-audio dictation recorder and base64 helper

RN-native recorder hook (useMobileDictation) + expo-file-system base64
reader + a pure, unit-tested formatRecordingMeta helper. Browser-only
@rox/ui voice core cannot run in RN, so this is a fresh implementation;
only the backend voice.transcribe call is shared."
```

---

### T4 — RN `MicButton` component

A mobile-native mic button (NOT the `packages/ui` web one). `Pressable` with press-and-hold to record: `onPressIn` → `start()`, `onPressOut` → `stop()`. Shows the `Mic` glyph idle/recording (tinted red while recording) and an `ActivityIndicator` while transcribing. Disabled state mirrors the desktop affordance.

**Create** `apps/mobile/components/voice/MicButton/MicButton.tsx`:

```tsx
import { Mic } from "lucide-react-native";
import { ActivityIndicator, Pressable } from "react-native";
import { Icon } from "@/components/ui/icon";
import {
	type MobileRecording,
	useMobileDictation,
} from "@/lib/voice/useDictation";

export interface MicButtonProps {
	/** Fired with the encoded clip once a hold-to-record gesture completes. */
	onComplete: (recording: MobileRecording) => void;
	/** External busy flag (e.g. while the host awaits voice.transcribe). */
	transcribing?: boolean;
	disabled?: boolean;
}

/**
 * Hold-to-record mic button for mobile. Press and hold to record, release to
 * stop + transcribe. RN-native (Pressable + lucide Mic via the repo Icon
 * wrapper + ActivityIndicator) — deliberately NOT the browser-DOM MicButton in
 * packages/ui, which depends on MediaRecorder/pointer events and cannot run in
 * React Native.
 */
export function MicButton({ onComplete, transcribing, disabled }: MicButtonProps) {
	const dictation = useMobileDictation({ onComplete });

	const busy = dictation.state === "transcribing" || transcribing === true;
	const isDisabled = disabled === true || busy;

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel="Диктовать описание"
			accessibilityHint="Удерживайте, чтобы записать, отпустите, чтобы расшифровать"
			disabled={isDisabled}
			onPressIn={() => {
				if (!isDisabled) void dictation.start();
			}}
			onPressOut={() => {
				void dictation.stop();
			}}
			className={
				dictation.isRecording
					? "size-9 items-center justify-center rounded-full bg-red-500/15"
					: "size-9 items-center justify-center rounded-full bg-foreground/10"
			}
			style={isDisabled && !busy ? { opacity: 0.4 } : undefined}
		>
			{busy ? (
				<ActivityIndicator size="small" />
			) : (
				<Icon
					as={Mic}
					className={
						dictation.isRecording
							? "size-5 text-red-500"
							: "size-5 text-muted-foreground"
					}
				/>
			)}
		</Pressable>
	);
}
```

**Create** `apps/mobile/components/voice/MicButton/index.ts`:

```ts
export { MicButton, type MicButtonProps } from "./MicButton";
```

**Verify:** type-only at this stage (covered by T6's `turbo typecheck`). No standalone runtime test — RN component rendering needs the simulator (see T6 honest note).

**Commit:**

```bash
git add apps/mobile/components/voice
git commit -m "feat(mobile): add RN hold-to-record MicButton for dictation

Pressable + lucide Mic + ActivityIndicator, hold-to-record gesture wired
to useMobileDictation. Mobile-native; not the browser MicButton in @rox/ui."
```

---

### T5 — Mount the mic in `CreateTaskSheet` (description field)

Wire the mic next to the description `Textarea`. On `onComplete`, call `apiClient.voice.transcribe.mutate(...)` and append the transcript into `description` (use `processed?.ru || rawText`, mirroring desktop `ChatInputFooter`). A local `transcribing` state drives both the button spinner and a small "Расшифровка…" hint and is fed back into `MicButton` so the gesture can't re-fire mid-request.

**Edit** `apps/mobile/screens/(authenticated)/(tasks)/tasks/components/CreateTaskSheet/CreateTaskSheet.tsx`.

Add imports (top of file, with the other imports):

```ts
import { apiClient } from "@/lib/trpc/client";
import { MicButton } from "@/components/voice/MicButton";
import type { MobileRecording } from "@/lib/voice/useDictation";
```

Add `useState` for the transcribe flight (next to the existing `description` state):

```ts
	const [transcribing, setTranscribing] = useState(false);
```

Add the completion handler (inside the component, near `handleCreate`):

```ts
	const handleDictation = async (recording: MobileRecording) => {
		setTranscribing(true);
		try {
			const result = await apiClient.voice.transcribe.mutate({
				audioBase64: recording.audioBase64,
				mimeType: recording.mimeType,
				durationMs: recording.durationMs,
			});
			const text = result.processed?.ru || result.rawText;
			if (text) {
				setDescription((prev) => (prev ? `${prev} ${text}` : text));
			}
		} catch {
			// Keep the sheet usable on failure; the user can retry or type.
		} finally {
			setTranscribing(false);
		}
	};
```

Replace the description block. Find:

```tsx
					<Textarea
						placeholder="Description (optional)"
						value={description}
						onChangeText={setDescription}
					/>
```

and replace it with:

```tsx
					<View className="gap-1.5">
						<View className="flex-row items-center justify-between">
							<Text className="text-sm text-muted-foreground">Description</Text>
							<MicButton
								onComplete={handleDictation}
								transcribing={transcribing}
							/>
						</View>
						<Textarea
							placeholder="Description (optional)"
							value={description}
							onChangeText={setDescription}
						/>
						{transcribing ? (
							<Text className="text-xs text-muted-foreground">Расшифровка…</Text>
						) : null}
					</View>
```

`View` and `Text` are already imported in this file (`react-native` `View` line 3, `@/components/ui/text` `Text` line 13), so no extra UI imports beyond the three added above.

**Reset hygiene:** the existing `reset()` clears title/description/priority; transcription appends to `description`, so it is cleared by `reset()` on close — no extra reset needed. (If desired, the engineer may also `setTranscribing(false)` in `reset()`, but it self-clears via `finally`.)

**Verify:** covered by T6 (`turbo typecheck` proves the wiring type-checks end-to-end: `MobileRecording` → `voice.transcribe` input → `processed?.ru || rawText`).

**Commit:**

```bash
git add "apps/mobile/screens/(authenticated)/(tasks)/tasks/components/CreateTaskSheet/CreateTaskSheet.tsx"
git commit -m "feat(mobile): dictate task description via voice in CreateTaskSheet

Mount the RN MicButton beside the description field; on completion call
voice.transcribe and append processed?.ru || rawText into the description."
```

---

### T6 — Verification gate

Run the static gates and the unit test. State the runtime gap honestly.

```bash
# 1. Types across the mobile app (proves T3/T4/T5 wiring, incl. the
#    voice.transcribe argument/return contract).
bunx turbo typecheck --filter=@rox/mobile

# 2. Lint/format (Biome). Redirect stdin — repo lint blocks on a non-TTY pipe
#    (see AGENTS.md troubleshooting). Must exit 0 with no output.
bun run lint < /dev/null

# 3. Unit test for the pure helper (plus the existing CreateTaskSheet test).
bun test "apps/mobile/screens/(authenticated)/(tasks)/tasks/components/CreateTaskSheet" apps/mobile/lib/voice
```

**Pass criteria:**
- `turbo typecheck --filter=@rox/mobile` → no type errors.
- `bun run lint < /dev/null` → exits 0, prints nothing (CI treats warnings as errors).
- `bun test` → `formatRecordingMeta` (3) and the existing `CreateTaskSheet` suites green.

If lint reports anything, run `bun run lint:fix`, re-verify `bun run lint < /dev/null` is clean, then amend the relevant commit.

**Honest note — NOT covered by the above (runtime proof is out of band):**
- The static gates do **not** exercise real recording, the mic permission prompt, the iOS audio session, base64 encoding of a real file, or the live `voice.transcribe` round-trip.
- Runtime proof requires a **dev-client rebuild** (`cd apps/mobile && bunx expo run:ios` or `bunx expo run:android`, or an EAS dev build) on a simulator/device, then: open Tasks → tap `+` → hold the mic, speak, release → confirm the transcript lands in the description. Capture a screenshot/screen recording as evidence.
- The exact `expo-audio` version for SDK 56 is resolved by `bunx expo install` (not hand-pinned here); the API surface used (`useAudioRecorder`, `RecordingPresets.HIGH_QUALITY`, `prepareToRecordAsync`, `record`, `stop`, `recorder.uri`, `useAudioRecorderState().durationMillis`, `AudioModule.requestRecordingPermissionsAsync`, `setAudioModeAsync`) is the documented, stable Expo recording recipe across SDK 53-56 — but confirm against the installed version's `.d.ts` if typecheck flags any signature drift (residual risk, see Self-review).

**Commit (if T6 produced only lint:fix formatting):**

```bash
git add -A
git commit -m "chore(mobile): lint/format fixes for voice dictation slice"
```

---

## Self-review

### Spec → tasks mapping

| Spec requirement (Phase-3 / mobile, `…voice-everywhere…design.md`) | Task(s) |
|---|---|
| "Фаза 3 — mobile голос" (line 12); end goal voice everywhere incl. mobile (line 16) | T1–T5 (this whole plan) |
| "нет агентного чат-экрана (только `CreateTaskSheet`)" (line 99) — host surface is CreateTaskSheet, no chat screen | T5 mounts in `CreateTaskSheet`; **no** chat screen built (explicit scope) |
| "нужен `expo-audio`" (line 99) | T1 install · T3d recorder hook |
| "разрешения микрофона (iOS `NSMicrophoneUsageDescription`, Android `RECORD_AUDIO`) в `apps/mobile/app.config.ts` + rebuild dev-client" (line 99) | T2 (config) + explicit rebuild note in T2 & T6 |
| "`expo-file-system@56` уже есть для base64" (line 99) | T3a `new File(uri).base64()` |
| mobile adapter = "`apiClient(HTTP)+expo-audio` / native record" (arch diagram, lines 80-81); core NOT importing tRPC | T3 (native record) + T5 (host calls `voice.transcribe`, mirroring desktop `ChatInputFooter`) |
| shared backend `voice.transcribe`, server `GROQ_API_KEY` (arch line 84) | T5 calls `apiClient.voice.transcribe.mutate`; key stays server-side (no client changes) |

### Risks & mitigations

1. **Native rebuild required (highest-impact gap).** T2's permissions and T1's native module are inert until a dev-client rebuild. Mitigation: T2 and T6 both call this out explicitly; the plan never claims runtime success from typecheck/lint. The executing engineer must do `bunx expo run:ios|android` (or EAS dev build) and attach screen-capture evidence before declaring the feature done.
2. **iOS audio session.** Without `setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true })` iOS records silence (or not at all), especially with the ringer muted. Mitigation: `start()` always sets the audio mode before `record()`. Residual: background recording is **not** enabled (`allowsBackgroundRecording` omitted) — acceptable for a foreground sheet.
3. **Permission denial.** A denied mic permission must not crash. Mitigation: `requestRecordingPermissionsAsync().granted === false` short-circuits into `state:"error"` with the RU hint "Нет доступа к микрофону"; the sheet stays fully usable for typing. Residual: we don't deep-link to Settings on permanent denial — acceptable v1; a future enhancement can add a "Open Settings" affordance.
4. **expo-audio version/API drift on SDK 56.** Version is auto-resolved by `bunx expo install` (T1), not hand-pinned. The recipe used is the documented stable Expo recording API across SDK 53-56, but if `turbo typecheck` (T6) flags a signature mismatch, reconcile against the installed `expo-audio` `.d.ts` (e.g. `requestRecordingPermissionsAsync` location, `durationMillis` field name). This is the single largest technical unknown; it surfaces as a typecheck failure, not a silent runtime bug.
5. **mimeType correctness.** `RecordingPresets.HIGH_QUALITY` yields `.m4a`/AAC; we send `mimeType:"audio/m4a"`. The server's `mimeType` is a free-form `z.string()` (no whitelist) and is forwarded to Groq Whisper, which accepts m4a/AAC — so transcription should succeed. Residual: if a device produces a different container, transcription quality (not the type check) is the only thing at risk; `formatRecordingMeta` allows passing a different mime if needed.
6. **Duration source.** `useAudioRecorderState().durationMillis` is the primary duration; a `Date.now()` elapsed fallback covers the case where state hasn't ticked for a very short hold. `formatRecordingMeta` rounds to a non-negative int to satisfy `z.number().int().nonnegative()`. The `minDurationMs` guard (400ms) drops accidental taps before any network call.
7. **No regression to web/desktop.** This plan touches only `apps/mobile/**`; it does not import or modify `packages/ui/src/voice/**` or any desktop/web code, so the Phase-1 dictation paths are untouched.
