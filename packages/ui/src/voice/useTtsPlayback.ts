import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Headless playback state for the "Прослушать" (listen) button (FN-043 / #486).
 *
 * Platform-neutral: synthesis is injected (`synthesize`) so the desktop wires it
 * to the edge-TTS tRPC call while web/mobile can supply their own transport. The
 * hook owns an <audio> element lifecycle, exposes idle/loading/playing state,
 * and toggles playback. A new request cancels any in-flight one so rapid clicks
 * don't stack audio.
 */

export type TtsPlaybackState = "idle" | "loading" | "playing";

export interface SynthesizedAudio {
	/** Base64-encoded audio payload. */
	audioBase64: string;
	/** MIME type, e.g. "audio/mpeg". */
	mimeType: string;
}

export interface UseTtsPlaybackOptions {
	/** Produce audio for the given text. Rejections surface via `onError`. */
	synthesize: (text: string) => Promise<SynthesizedAudio>;
	/** Optional error sink (e.g. a toast). */
	onError?: (error: unknown) => void;
}

export interface UseTtsPlayback {
	state: TtsPlaybackState;
	isPlaying: boolean;
	isLoading: boolean;
	/** Synthesize (if needed) and play `text`, or stop if already active. */
	toggle: (text: string) => void;
	/** Stop playback and release the current audio. */
	stop: () => void;
}

function toDataUri(audio: SynthesizedAudio): string {
	return `data:${audio.mimeType};base64,${audio.audioBase64}`;
}

export function useTtsPlayback({
	synthesize,
	onError,
}: UseTtsPlaybackOptions): UseTtsPlayback {
	const [state, setState] = useState<TtsPlaybackState>("idle");
	const audioRef = useRef<HTMLAudioElement | null>(null);
	// Monotonic token: a newer request invalidates older async resolutions.
	const requestToken = useRef(0);

	const releaseAudio = useCallback(() => {
		const audio = audioRef.current;
		if (audio) {
			audio.pause();
			audio.src = "";
			audioRef.current = null;
		}
	}, []);

	const stop = useCallback(() => {
		requestToken.current += 1;
		releaseAudio();
		setState("idle");
	}, [releaseAudio]);

	const toggle = useCallback(
		(text: string) => {
			// Active → stop (acts as a play/pause toggle).
			if (state !== "idle") {
				stop();
				return;
			}
			const token = ++requestToken.current;
			setState("loading");
			synthesize(text)
				.then((audio) => {
					if (token !== requestToken.current) return; // superseded
					const el = new Audio(toDataUri(audio));
					audioRef.current = el;
					el.onended = () => {
						if (token === requestToken.current) {
							releaseAudio();
							setState("idle");
						}
					};
					el.onerror = () => {
						if (token === requestToken.current) {
							releaseAudio();
							setState("idle");
							onError?.(new Error("Не удалось воспроизвести аудио"));
						}
					};
					setState("playing");
					void el.play().catch((err) => {
						if (token === requestToken.current) {
							releaseAudio();
							setState("idle");
							onError?.(err);
						}
					});
				})
				.catch((err) => {
					if (token !== requestToken.current) return;
					setState("idle");
					onError?.(err);
				});
		},
		[state, stop, synthesize, releaseAudio, onError],
	);

	// Release audio if the host unmounts mid-playback.
	useEffect(() => releaseAudio, [releaseAudio]);

	return {
		state,
		isPlaying: state === "playing",
		isLoading: state === "loading",
		toggle,
		stop,
	};
}
