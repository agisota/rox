import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@rox/ui/dialog";
import { useState } from "react";
import { LuLink2 } from "react-icons/lu";
import { ExperimentalFeatureGate } from "renderer/components/ExperimentalFeatureGate";
import { SessionObjectLinkSurface } from "./SessionObjectLinkPanel";

export interface SessionObjectLinkLauncherProps {
	/** The chat session this control links to a Project-OS object. */
	sessionId: string | null;
	/** Optional session title used for the session graph node label. */
	sessionTitle?: string | null;
}

/**
 * Gated toolbar entry for `projectOs.objectLinkedChat` (desktop parity). Renders
 * a compact "Link to object" button next to the chat session selector; clicking
 * it opens the {@link SessionObjectLinkSurface} (the real link control + the
 * session's backlinks readout) inside a dialog.
 *
 * The whole entry is wrapped in {@link ExperimentalFeatureGate}, so when the gate
 * is closed (feature disabled / not available / kill switch) the button is ABSENT
 * — no regression versus today. It also renders nothing without a concrete
 * session id (a brand-new, not-yet-created chat has no session to link). Because
 * the gate is resolved here, the embedded surface is mounted via
 * {@link SessionObjectLinkSurface} (the already-gated inner surface) rather than
 * the self-gating {@link SessionObjectLinkPanel}, avoiding a redundant second gate.
 */
export function SessionObjectLinkLauncher({
	sessionId,
	sessionTitle,
}: SessionObjectLinkLauncherProps) {
	const [open, setOpen] = useState(false);

	if (!sessionId) {
		return null;
	}

	return (
		<ExperimentalFeatureGate featureId="projectOs.objectLinkedChat">
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-7 gap-1 px-2 text-muted-foreground text-xs hover:text-foreground"
						aria-label="Связать сессию с объектом"
						title="Связать сессию с объектом"
					>
						<LuLink2 className="size-3.5" />
						<span className="hidden sm:inline">Связать</span>
					</Button>
				</DialogTrigger>
				<DialogContent className="max-w-lg">
					<DialogHeader>
						<DialogTitle>Связать сессию с объектом</DialogTitle>
						<DialogDescription>
							Привяжите эту сессию к объекту проекта и просматривайте связи.
						</DialogDescription>
					</DialogHeader>
					<SessionObjectLinkSurface
						sessionId={sessionId}
						sessionTitle={sessionTitle}
					/>
				</DialogContent>
			</Dialog>
		</ExperimentalFeatureGate>
	);
}
