import { useShouldAnimate } from "@rox/ui/motion";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { type CSSProperties, useMemo } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { parsePopoutParams, rehydratePane } from "./rehydratePaneLayout";

export const Route = createFileRoute("/popout/")({ component: PopoutPage });

// Frameless glass windows are dragged by `-webkit-app-region: drag` regions;
// interactive children opt back out with `no-drag` (same as the Spectre route).
const DRAG = { WebkitAppRegion: "drag" } as CSSProperties;
const NO_DRAG = { WebkitAppRegion: "no-drag" } as CSSProperties;

const KIND_LABEL: Record<string, string> = {
	chat: "Chat",
	"file-tree": "Files",
	terminal: "Terminal",
};

/**
 * Tear-off popout window (F52).
 *
 * Renders a single pane as a view onto the one shared core-state. The pane
 * identity + a serialized `paneLayout` snapshot arrive via the hash query
 * (`#/popout?…`); we rehydrate just the torn-off pane from that snapshot and
 * host it under a frameless glass custom titlebar. The window stays live through
 * the same Electric/collections + tRPC (observable) core every window shares —
 * this surface never forks a private copy of state.
 *
 * The tear-off entrance morph is gated on `useShouldAnimate("essential")` so it
 * is skipped under reduced-motion.
 */
function PopoutPage() {
	const params = useMemo(() => {
		const query = new URLSearchParams(window.location.hash.split("?")[1] ?? "");
		return parsePopoutParams((key) => query.get(key));
	}, []);

	const pane = useMemo(() => {
		if (!params) return null;
		return rehydratePane(params.paneLayoutJson, params.paneId, params.kind);
	}, [params]);

	const shouldAnimate = useShouldAnimate("essential");
	const close = electronTrpc.window.close.useMutation();

	if (!params) {
		return (
			<div className="flex h-screen w-screen items-center justify-center text-sm text-white/60">
				Не удалось открыть окно: неполные параметры панели.
			</div>
		);
	}

	const label = KIND_LABEL[params.kind] ?? params.kind;

	return (
		<motion.div
			className="flex h-screen w-screen flex-col bg-black/30 backdrop-blur-xl"
			initial={shouldAnimate ? { opacity: 0, scale: 0.97 } : false}
			animate={{ opacity: 1, scale: 1 }}
			transition={
				shouldAnimate ? { duration: 0.18, ease: "easeOut" } : { duration: 0 }
			}
		>
			{/* Custom titlebar — drag region with traffic-light inset on macOS. */}
			<header
				className="flex h-10 shrink-0 items-center justify-between px-4 pl-20 text-xs font-medium text-white/70"
				style={DRAG}
			>
				<span className="select-none">{label}</span>
				<button
					type="button"
					onClick={() => close.mutate()}
					className="rounded px-2 py-1 text-white/50 hover:bg-white/10 hover:text-white"
					style={NO_DRAG}
				>
					Close
				</button>
			</header>

			<main className="min-h-0 flex-1 overflow-hidden" style={NO_DRAG}>
				{pane ? (
					<PaneHost workspaceId={params.workspaceId} pane={pane} />
				) : (
					<div className="flex h-full items-center justify-center text-sm text-white/50">
						Панель «{params.paneId}» не найдена в текущем макете.
					</div>
				)}
			</main>
		</motion.div>
	);
}

/**
 * Host the rehydrated single pane. The concrete pane-body components
 * (chat/file-tree/terminal) live in the workspace-scoped pane registry and the
 * `@rox/panes` package; this host is the mount point a follow-up wires them into
 * once the popout renderer is composed with the authenticated workspace
 * providers. Until then it surfaces the rehydrated identity + data so the window
 * is a real, inspectable view onto the shared state rather than a blank shell.
 */
function PaneHost({
	workspaceId,
	pane,
}: {
	workspaceId: string;
	pane: { paneId: string; kind: string; data: unknown };
}) {
	return (
		<section className="flex h-full flex-col gap-2 p-4 text-white/80">
			<div className="text-sm">
				<span className="text-white/50">workspace:</span> {workspaceId}
			</div>
			<div className="text-sm">
				<span className="text-white/50">pane:</span> {pane.paneId} ({pane.kind})
			</div>
			<pre className="min-h-0 flex-1 select-text overflow-auto rounded bg-black/30 p-3 text-xs text-white/70">
				{JSON.stringify(pane.data, null, 2)}
			</pre>
		</section>
	);
}
