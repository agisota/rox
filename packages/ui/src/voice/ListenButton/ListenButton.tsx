import { cn } from "@rox/ui/utils";
import { Loader2Icon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { type SynthesizedAudio, useTtsPlayback } from "../useTtsPlayback";

export interface ListenButtonProps {
	/** Text to read aloud (the agent reply's plain text). */
	text: string;
	/** Synthesize the text to audio (desktop wires this to edge-TTS over tRPC). */
	synthesize: (text: string) => Promise<SynthesizedAudio>;
	/** Optional error sink (e.g. a toast). */
	onError?: (error: unknown) => void;
	disabled?: boolean;
	className?: string;
}

/**
 * "Прослушать" button (FN-043 / #486): reads an agent reply aloud via free
 * edge-TTS. Platform-neutral — synthesis is injected so the same button ships on
 * desktop, web, and mobile. Click to play; click again (or when it finishes) to
 * stop. Shows a spinner while synthesizing and a muted icon while playing.
 */
export function ListenButton({
	text,
	synthesize,
	onError,
	disabled,
	className,
}: ListenButtonProps) {
	const playback = useTtsPlayback({ synthesize, onError });
	const hasText = text.trim().length > 0;
	const isBusy = playback.isPlaying || playback.isLoading;

	const label = playback.isLoading
		? "Готовлю озвучку…"
		: playback.isPlaying
			? "Остановить"
			: "Прослушать";

	return (
		<button
			type="button"
			aria-label={label}
			title={label}
			aria-pressed={playback.isPlaying}
			disabled={disabled || !hasText}
			onClick={() => playback.toggle(text)}
			className={cn(
				"inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground",
				isBusy && "text-foreground",
				(disabled || !hasText) && "opacity-40",
				className,
			)}
		>
			{playback.isLoading ? (
				<Loader2Icon className="size-3.5 animate-spin" />
			) : playback.isPlaying ? (
				<VolumeXIcon className="size-3.5" />
			) : (
				<Volume2Icon className="size-3.5" />
			)}
			<span className="sr-only">{label}</span>
		</button>
	);
}
