import { Button } from "@rox/ui/button";
import { Checkbox } from "@rox/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { Label } from "@rox/ui/label";
import { useState } from "react";
import { SiGithub } from "react-icons/si";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { GhAuthDialog } from "renderer/routes/_authenticated/onboarding/components/GhAuthDialog";
import { useGithubConnectBanner } from "./useGithubConnectBanner";

/**
 * Optional post-login nudge to connect GitHub (the `gh` CLI). GitHub is not
 * required to use Rox — this banner is purely additive and shows at most once
 * per login (see {@link useGithubConnectBanner}).
 *
 * Interaction rules (per spec):
 *  - centered modal-style banner,
 *  - closable ONLY via the top-right X (no overlay / escape dismissal),
 *  - exactly one action button, which starts the GitHub connect flow,
 *  - a "Больше не показывать" checkbox that persists a permanent opt-out.
 */
export function GithubConnectBanner() {
	const { open, dismiss, neverShow, setNeverShow } = useGithubConnectBanner();
	const [ghAuthOpen, setGhAuthOpen] = useState(false);
	const utils = electronTrpc.useUtils();

	const handleConnect = () => {
		// Hand off to the same gh-login terminal dialog used in onboarding.
		setGhAuthOpen(true);
	};

	const handleGhExit = () => {
		// Re-check status so any other gh-gated UI refreshes; then close the
		// banner — the user has been through the flow.
		void utils.system.detectGhCli.invalidate();
		dismiss();
	};

	return (
		<>
			<Dialog
				open={open && !ghAuthOpen}
				// Close ONLY via the X button — swallow overlay clicks + escape so the
				// banner can't be dismissed accidentally.
				onOpenChange={(next) => {
					if (!next) dismiss();
				}}
			>
				<DialogContent
					className="max-w-md gap-5 text-center sm:max-w-md"
					onInteractOutside={(e) => e.preventDefault()}
					onEscapeKeyDown={(e) => e.preventDefault()}
				>
					<DialogHeader className="items-center gap-3 text-center sm:text-center">
						<div className="flex size-11 items-center justify-center rounded-xl bg-foreground text-background">
							<SiGithub className="size-5.5" />
						</div>
						<DialogTitle>Подключите GitHub</DialogTitle>
						<DialogDescription>
							Подключение GitHub позволяет клонировать репозитории, отправлять
							изменения и открывать pull request прямо из Rox. Это необязательно
							— вы можете подключить его позже в настройках.
						</DialogDescription>
					</DialogHeader>

					{/*
					 * GIF placeholder. TODO(ROX-522): replace with the real
					 * GitHub-sync demo gif, e.g.
					 *   import githubSyncGif from "renderer/assets/github-connect-demo.gif";
					 * and render it via <img src={githubSyncGif} … />.
					 */}
					<div className="flex aspect-video w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-xs text-muted-foreground">
						GIF: демонстрация синхронизации с GitHub
					</div>

					<Button
						type="button"
						onClick={handleConnect}
						className="w-full gap-2"
					>
						<SiGithub className="size-4" />
						Подключить GitHub
					</Button>

					<div className="flex items-center justify-center gap-2">
						<Checkbox
							id="github-banner-never-show"
							checked={neverShow}
							onCheckedChange={(checked) => setNeverShow(checked === true)}
						/>
						<Label
							htmlFor="github-banner-never-show"
							className="text-xs text-muted-foreground"
						>
							Больше не показывать
						</Label>
					</div>
				</DialogContent>
			</Dialog>

			<GhAuthDialog
				open={ghAuthOpen}
				onOpenChange={setGhAuthOpen}
				onExit={handleGhExit}
			/>
		</>
	);
}
