import { cn } from "@rox/ui/utils";
import { Loader2Icon, MicIcon } from "lucide-react";
import type React from "react";
import { useRef } from "react";
import { useHotkey } from "renderer/hotkeys";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { type Recording, useDictation } from "renderer/lib/voice/useDictation";
import { WaveformOverlay } from "./WaveformOverlay";

/** Upward drag (px) past which a held recording locks into toggle mode. */
const LOCK_DRAG_THRESHOLD = 44;

interface MicButtonProps {
	onComplete?: (recording: Recording, locked: boolean) => void;
	transcribing?: boolean;
	disabled?: boolean;
}

/**
 * Dictation mic button with two gestures:
 *   - **push-to-talk**: press and hold to record, release to stop + send.
 *   - **toggle-lock**: press, drag up past a threshold to lock; release keeps
 *     recording; a later tap stops + sends.
 */
export function MicButton({
	onComplete,
	transcribing,
	disabled,
}: MicButtonProps) {
	const dictation = useDictation({ onComplete });
	const pointerStartY = useRef<number | null>(null);

	// Plain dictation can be turned off in Settings → Voice. Cache-first: only
	// hide once we've explicitly read `false` (undefined = loading → keep the
	// default-on button so it doesn't flicker out on mount).
	const dictationEnabled =
		electronTrpc.settings.getDictationEnabled.useQuery().data;
	const dictationOff = dictationEnabled === false;

	// Keyboard shortcut toggles dictation in locked mode — press to start, press
	// again to stop + insert. Modifiable in Settings → Keyboard. Disabled when
	// the user has turned dictation off.
	useHotkey("DICTATE", () => {
		if (dictationOff || disabled || transcribing) return;
		if (dictation.isActive) {
			dictation.stop();
		} else {
			void dictation.start().then(() => dictation.lock());
		}
	});

	const handlePointerDown = (e: React.PointerEvent) => {
		if (disabled || transcribing) return;
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

	// Hidden entirely when dictation is turned off in Settings → Voice.
	if (dictationOff) return null;

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
