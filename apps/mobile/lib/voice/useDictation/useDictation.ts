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
			await setAudioModeAsync({
				playsInSilentMode: true,
				allowsRecording: true,
			});
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
	}, [recorder, recorderState.durationMillis, state, minDurationMs, onComplete]);

	return {
		state,
		isRecording: state === "recording" || recorderState.isRecording === true,
		durationMs: recorderState.durationMillis ?? 0,
		error,
		start,
		stop,
	};
}
