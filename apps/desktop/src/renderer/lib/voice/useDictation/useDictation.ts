import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Dictation recorder hook — voice-dictation epic.
 *
 * Wraps `getUserMedia` + `MediaRecorder` with a small state machine that powers
 * both gestures:
 *   - push-to-talk: start on press, `stop()` on release.
 *   - toggle-lock: `lock()` mid-press, `stop()` on a later tap.
 *
 * The last recorded blob is always kept (`lastRecording`) so a failed transcribe
 * can be retried without re-recording. Exposes a live `audioLevel` (0..1) for the
 * waveform.
 */

export type DictationState =
	| "idle"
	| "requesting"
	| "recording"
	| "locked"
	| "error";

export interface Recording {
	blob: Blob;
	mimeType: string;
	durationMs: number;
}

export interface UseDictationOptions {
	/** Fired when a recording finishes (stop, not cancel) with ≥ minimal audio. */
	onComplete?: (recording: Recording) => void;
	/** Minimum duration to treat a recording as real (ms). */
	minDurationMs?: number;
}

export interface UseDictation {
	state: DictationState;
	isActive: boolean;
	isLocked: boolean;
	durationMs: number;
	/** Smoothed microphone level, 0..1, for the waveform. */
	audioLevel: number;
	error: string | null;
	lastRecording: Recording | null;
	start: () => Promise<void>;
	lock: () => void;
	stop: () => void;
	cancel: () => void;
}

function pickMimeType(): string {
	const candidates = [
		"audio/webm;codecs=opus",
		"audio/webm",
		"audio/mp4",
		"audio/ogg;codecs=opus",
	];
	for (const type of candidates) {
		if (
			typeof MediaRecorder !== "undefined" &&
			MediaRecorder.isTypeSupported(type)
		) {
			return type;
		}
	}
	return "audio/webm";
}

export function useDictation(options: UseDictationOptions = {}): UseDictation {
	const { onComplete, minDurationMs = 400 } = options;

	const [state, setState] = useState<DictationState>("idle");
	const [durationMs, setDurationMs] = useState(0);
	const [audioLevel, setAudioLevel] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [lastRecording, setLastRecording] = useState<Recording | null>(null);

	const recorderRef = useRef<MediaRecorder | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const startedAtRef = useRef(0);
	const cancelledRef = useRef(false);
	const mimeRef = useRef("audio/webm");
	const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
	const audioCtxRef = useRef<AudioContext | null>(null);
	const analyserRef = useRef<AnalyserNode | null>(null);
	const rafRef = useRef<number | null>(null);

	const teardown = useCallback(() => {
		if (durationTimerRef.current) {
			clearInterval(durationTimerRef.current);
			durationTimerRef.current = null;
		}
		if (rafRef.current != null) {
			cancelAnimationFrame(rafRef.current);
			rafRef.current = null;
		}
		analyserRef.current = null;
		if (audioCtxRef.current) {
			void audioCtxRef.current.close().catch(() => {});
			audioCtxRef.current = null;
		}
		if (streamRef.current) {
			for (const track of streamRef.current.getTracks()) track.stop();
			streamRef.current = null;
		}
		setAudioLevel(0);
	}, []);

	const tickLevel = useCallback(() => {
		const analyser = analyserRef.current;
		if (!analyser) return;
		const buf = new Uint8Array(analyser.frequencyBinCount);
		analyser.getByteTimeDomainData(buf);
		let sum = 0;
		for (const v of buf) {
			const centered = (v - 128) / 128;
			sum += centered * centered;
		}
		const rms = Math.sqrt(sum / buf.length);
		setAudioLevel((prev) => prev * 0.6 + Math.min(1, rms * 2.2) * 0.4);
		rafRef.current = requestAnimationFrame(tickLevel);
	}, []);

	const start = useCallback(async () => {
		if (state === "recording" || state === "locked" || state === "requesting") {
			return;
		}
		setError(null);
		setState("requesting");
		cancelledRef.current = false;
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			streamRef.current = stream;
			const mimeType = pickMimeType();
			mimeRef.current = mimeType;
			const recorder = new MediaRecorder(stream, { mimeType });
			chunksRef.current = [];
			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) chunksRef.current.push(e.data);
			};
			recorder.onstop = () => {
				const durationFinal = Date.now() - startedAtRef.current;
				const blob = new Blob(chunksRef.current, { type: mimeRef.current });
				teardown();
				setState("idle");
				setDurationMs(0);
				if (cancelledRef.current) return;
				if (blob.size === 0 || durationFinal < minDurationMs) return;
				const recording: Recording = {
					blob,
					mimeType: mimeRef.current,
					durationMs: durationFinal,
				};
				setLastRecording(recording);
				onComplete?.(recording);
			};

			// Audio level metering.
			const AudioCtx =
				window.AudioContext ||
				(window as unknown as { webkitAudioContext: typeof AudioContext })
					.webkitAudioContext;
			const audioCtx = new AudioCtx();
			audioCtxRef.current = audioCtx;
			const sourceNode = audioCtx.createMediaStreamSource(stream);
			const analyser = audioCtx.createAnalyser();
			analyser.fftSize = 512;
			sourceNode.connect(analyser);
			analyserRef.current = analyser;
			rafRef.current = requestAnimationFrame(tickLevel);

			startedAtRef.current = Date.now();
			recorder.start(100);
			recorderRef.current = recorder;
			setDurationMs(0);
			durationTimerRef.current = setInterval(() => {
				setDurationMs(Date.now() - startedAtRef.current);
			}, 200);
			setState("recording");
		} catch (err) {
			teardown();
			setState("error");
			setError(
				err instanceof DOMException && err.name === "NotAllowedError"
					? "Нет доступа к микрофону"
					: "Не удалось начать запись",
			);
		}
	}, [state, onComplete, minDurationMs, teardown, tickLevel]);

	const lock = useCallback(() => {
		setState((s) => (s === "recording" ? "locked" : s));
	}, []);

	const finish = useCallback(
		(cancelled: boolean) => {
			const recorder = recorderRef.current;
			if (!recorder || recorder.state === "inactive") {
				teardown();
				setState("idle");
				return;
			}
			cancelledRef.current = cancelled;
			recorder.stop();
			recorderRef.current = null;
		},
		[teardown],
	);

	const stop = useCallback(() => finish(false), [finish]);
	const cancel = useCallback(() => finish(true), [finish]);

	// Stop everything on unmount.
	useEffect(() => () => teardown(), [teardown]);

	return {
		state,
		isActive: state === "recording" || state === "locked",
		isLocked: state === "locked",
		durationMs,
		audioLevel,
		error,
		lastRecording,
		start,
		lock,
		stop,
		cancel,
	};
}
