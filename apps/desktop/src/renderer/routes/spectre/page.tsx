import { createFileRoute } from "@tanstack/react-router";
import { type CSSProperties, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/spectre/")({ component: SpectrePage });

// Electron lets a frameless window be dragged by regions marked
// `-webkit-app-region: drag`; interactive children opt back out with `no-drag`.
const DRAG = { WebkitAppRegion: "drag" } as CSSProperties;
const NO_DRAG = { WebkitAppRegion: "no-drag" } as CSSProperties;

/**
 * Rox Spectre — the standalone overlay-assistant surface (Pluely-class),
 * rendered inside the dedicated transparent always-on-top Spectre window (see
 * SpectreWindowManager). Summoned app-wide with Cmd/Ctrl+\. This is the
 * collapsed bar shell; on-demand screen capture + the streamed xai/grok-4.3 ask
 * land in a follow-up commit (the Spectre tRPC router).
 */
function SpectrePage() {
	const inputRef = useRef<HTMLInputElement>(null);
	const [value, setValue] = useState("");

	useEffect(() => {
		const focus = () => inputRef.current?.focus();
		window.ipcRenderer.on("spectre:summoned", focus);
		focus();
		return () => window.ipcRenderer.off("spectre:summoned", focus);
	}, []);

	return (
		<div
			className="flex h-[88px] w-full items-center gap-3 rounded-2xl bg-black/60 px-4 backdrop-blur-xl"
			style={DRAG}
		>
			<span aria-hidden className="text-sm font-semibold text-white/70">
				Spectre
			</span>
			<input
				ref={inputRef}
				value={value}
				onChange={(e) => setValue(e.target.value)}
				placeholder="Спроси Spectre… (Grok 4.3 · Cmd+Enter — со скриншотом)"
				className="flex-1 select-text bg-transparent text-white outline-none placeholder:text-white/40"
				style={NO_DRAG}
			/>
		</div>
	);
}
