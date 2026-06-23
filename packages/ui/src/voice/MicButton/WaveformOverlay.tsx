import { cn } from "@rox/ui/utils";
import { CheckIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const BAR_COUNT = 40;

function formatDuration(ms: number): string {
	const total = Math.floor(ms / 1000);
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${s.toString().padStart(2, "0")}`;
}

interface WaveformOverlayProps {
	level: number;
	durationMs: number;
	locked: boolean;
	transcribing?: boolean;
	onStop: () => void;
	onCancel: () => void;
}

/**
 * Recording overlay shown above the composer while dictating: a scrolling
 * waveform driven by the live mic level, an elapsed timer, and cancel/confirm
 * controls. In locked mode the user taps the mic to stop; the ✓ here also stops.
 */
export function WaveformOverlay({
	level,
	durationMs,
	locked,
	transcribing,
	onStop,
	onCancel,
}: WaveformOverlayProps) {
	const [bars, setBars] = useState<number[]>(() =>
		new Array(BAR_COUNT).fill(0.04),
	);
	const levelRef = useRef(level);
	levelRef.current = level;

	useEffect(() => {
		const id = setInterval(() => {
			setBars((prev) => [
				...prev.slice(1),
				Math.max(0.04, Math.min(1, levelRef.current)),
			]);
		}, 80);
		return () => clearInterval(id);
	}, []);

	return (
		<div className="absolute inset-x-0 -top-2 z-20 -translate-y-full">
			<div className="mx-auto flex w-full max-w-[680px] items-center gap-3 rounded-[13px] border border-border/60 bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur">
				<span
					className={cn(
						"size-2 shrink-0 rounded-full",
						transcribing ? "bg-muted-foreground" : "animate-pulse bg-red-500",
					)}
				/>
				<div className="flex h-6 flex-1 items-center gap-[2px] overflow-hidden">
					{bars.map((h, i) => (
						<span
							// biome-ignore lint/suspicious/noArrayIndexKey: fixed-length scrolling waveform; bars are positional, not identity-bearing
							key={i}
							className="w-[2px] shrink-0 rounded-full bg-foreground/60"
							style={{ height: `${Math.round(h * 100)}%` }}
						/>
					))}
				</div>
				<span className="shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
					{transcribing ? "…" : formatDuration(durationMs)}
				</span>
				{locked && !transcribing && (
					<span className="shrink-0 rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] text-muted-foreground">
						фиксация
					</span>
				)}
				<button
					type="button"
					aria-label="Отменить"
					onClick={onCancel}
					disabled={transcribing}
					className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground disabled:opacity-40"
				>
					<XIcon className="size-3.5" />
				</button>
				<button
					type="button"
					aria-label="Готово"
					onClick={onStop}
					disabled={transcribing}
					className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-foreground transition-colors hover:bg-foreground/20 disabled:opacity-40"
				>
					<CheckIcon className="size-3.5" />
				</button>
			</div>
		</div>
	);
}
