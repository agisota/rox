import { skipToken } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

export const Route = createFileRoute("/spectre/")({ component: SpectrePage });

// Electron lets a frameless window be dragged by regions marked
// `-webkit-app-region: drag`; interactive children opt back out with `no-drag`.
const DRAG = { WebkitAppRegion: "drag" } as CSSProperties;
const NO_DRAG = { WebkitAppRegion: "no-drag" } as CSSProperties;

interface AskInput {
	prompt: string;
	imagePngBase64: string | null;
}

/**
 * Rox Spectre — the overlay-assistant surface, rendered in the dedicated
 * transparent always-on-top Spectre window. Summoned app-wide with Cmd/Ctrl+\.
 * Enter asks grok-4.3; Cmd+Enter attaches a screenshot (vision); Esc hides.
 */
function SpectrePage() {
	const inputRef = useRef<HTMLInputElement>(null);
	const [value, setValue] = useState("");
	const [answer, setAnswer] = useState("");
	const [askInput, setAskInput] = useState<AskInput | null>(null);
	const [busy, setBusy] = useState(false);

	const utils = electronTrpc.useUtils();
	const hide = electronTrpc.spectre.hide.useMutation();

	useEffect(() => {
		const focus = () => inputRef.current?.focus();
		window.ipcRenderer.on("spectre:summoned", focus);
		focus();
		return () => window.ipcRenderer.off("spectre:summoned", focus);
	}, []);

	// Reactive ask: setting `askInput` activates the subscription; clearing it
	// (skipToken) tears it down. Tokens stream into `answer`.
	electronTrpc.spectre.ask.useSubscription(askInput ?? skipToken, {
		onData: (event) => {
			if (event.type === "token" && event.text) {
				setAnswer((prev) => prev + event.text);
			} else if (event.type === "done") {
				setBusy(false);
			}
		},
		onError: (error) => {
			setAnswer(`⚠ ${error.message}`);
			setBusy(false);
		},
	});

	const submit = async (wantsScreen: boolean) => {
		const prompt = value.trim();
		if (!prompt || busy) return;
		setBusy(true);
		setAnswer("");
		let imagePngBase64: string | null = null;
		if (wantsScreen) {
			const shot = await utils.spectre.captureScreen.fetch();
			if (!shot.granted) {
				setAnswer(
					"⚠ Нет доступа к записи экрана — включи его в Системных настройках, чтобы Spectre видел экран.",
				);
				setBusy(false);
				return;
			}
			imagePngBase64 = shot.pngBase64;
		}
		setAskInput({ prompt, imagePngBase64 });
	};

	return (
		<div
			className="flex min-h-[88px] w-full flex-col gap-2 rounded-2xl bg-black/60 px-4 py-3 backdrop-blur-xl"
			style={DRAG}
		>
			<div className="flex items-center gap-3">
				<span aria-hidden className="text-sm font-semibold text-white/70">
					Spectre
				</span>
				<input
					ref={inputRef}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							hide.mutate();
							return;
						}
						if (e.key === "Enter") {
							void submit(e.metaKey || e.ctrlKey);
						}
					}}
					placeholder="Спроси Spectre… (Grok 4.3 · Cmd+Enter — со скриншотом)"
					className="flex-1 select-text bg-transparent text-white outline-none placeholder:text-white/40"
					style={NO_DRAG}
				/>
			</div>
			{answer && (
				<div
					className="max-h-64 select-text overflow-y-auto whitespace-pre-wrap text-sm text-white/90"
					style={NO_DRAG}
				>
					{answer}
				</div>
			)}
		</div>
	);
}
