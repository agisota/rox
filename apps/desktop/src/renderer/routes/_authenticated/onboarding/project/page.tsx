import { ANALYTICS_EVENTS } from "@rox/shared/constants";
import { Button } from "@rox/ui/button";
import { Card } from "@rox/ui/card";
import { Input } from "@rox/ui/input";
import { motionDuration, useShouldAnimate } from "@rox/ui/motion";
import { toast } from "@rox/ui/sonner";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { type FormEvent, type ReactNode, useState } from "react";
import { LuFolderOpen, LuGitBranch } from "react-icons/lu";
import { track, trackEvent } from "renderer/lib/analytics";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { useFinalizeProjectSetup } from "renderer/react-query/projects";
import { useFolderFirstImport } from "renderer/routes/_authenticated/_dashboard/components/AddRepositoryModals/hooks/useFolderFirstImport";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import { useOpenNewWorkspaceModal } from "renderer/stores/new-workspace-modal";

export const Route = createFileRoute("/_authenticated/onboarding/project/")({
	component: OnboardingProjectPage,
});

const cardVariants = {
	hidden: { opacity: 0, y: 8 },
	show: (i: number) => ({
		opacity: 1,
		y: 0,
		transition: { duration: motionDuration.base, delay: i * 0.08 },
	}),
};

function OnboardingProjectPage() {
	const navigate = useNavigate();
	const { refetch: refetchSession } = authClient.useSession();
	const { activeHostUrl } = useLocalHostService();
	const hostReady = activeHostUrl !== null;
	const openNewWorkspaceModal = useOpenNewWorkspaceModal();
	const { data: homeDir } = electronTrpc.window.getHomeDir.useQuery();
	const cloneTargetDir = homeDir ? `${homeDir}/rox/projects` : null;
	const [url, setUrl] = useState("");
	const [busy, setBusy] = useState(false);
	const shouldAnimate = useShouldAnimate("decorative");

	const folderImport = useFolderFirstImport({
		onError: (message) => toast.error(message),
	});
	const finalizeSetup = useFinalizeProjectSetup();

	// Adding a project finishes onboarding: mark onboarded, then hand off to the
	// dashboard's new-workspace modal pre-selected to the project just added.
	const finish = async (projectId: string) => {
		track("onboarding_finished", { outcome: "completed" });
		trackEvent(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
			project_id: projectId,
		});
		try {
			await apiTrpcClient.user.completeOnboarding.mutate();
			// Reactive refetch (not imperative getSession) so the layout guards'
			// useSession() sees onboardedAt before we navigate — otherwise the
			// _authenticated guard bounces /v2-workspaces back to /onboarding.
			await refetchSession({ query: { disableCookieCache: true } });
		} catch (error) {
			console.error("[onboarding] completeOnboarding failed", error);
			toast.error("Не удалось завершить запуск. Попробуйте ещё раз.");
			return;
		}
		// Land on the dashboard first, then open the modal. Opening it in the same
		// tick as navigate mounts the Dialog mid-route-transition, which thrashes
		// Radix's ref composition into a "Maximum update depth" loop.
		await navigate({ to: "/v2-workspaces", replace: true });
		openNewWorkspaceModal(projectId);
	};

	const handleOpenFolder = async () => {
		const result = await folderImport.start();
		if (result) {
			setBusy(true);
			await finish(result.projectId);
			setBusy(false);
		}
	};

	const handleClone = async (e: FormEvent) => {
		e.preventDefault();
		const trimmed = url.trim();
		if (!trimmed || !cloneTargetDir || !activeHostUrl) return;
		setBusy(true);
		try {
			const hostService = getHostServiceClientByUrl(activeHostUrl);
			const created = await hostService.project.create.mutate({
				name: repoNameFromUrl(trimmed),
				mode: { kind: "clone", parentDir: cloneTargetDir, url: trimmed },
			});
			finalizeSetup(activeHostUrl, created);
			await finish(created.projectId);
		} catch (err) {
			toast.error(
				err instanceof Error
					? err.message
					: "Не удалось клонировать репозиторий",
			);
		} finally {
			setBusy(false);
		}
	};

	return (
		<motion.div
			className="flex flex-col gap-3"
			initial={shouldAnimate ? "hidden" : false}
			animate="show"
		>
			<motion.div custom={0} variants={cardVariants}>
				<Card className="flex-row items-center gap-4 p-5">
					<ProjectIcon icon={<LuFolderOpen className="size-4.5" />} />
					<div className="min-w-0 flex-1">
						<p className="text-sm font-medium text-foreground">Открыть папку</p>
						<p className="text-xs text-muted-foreground">
							Выберите любую локальную папку, с git-репозиторием или без.
						</p>
					</div>
					<motion.div whileTap={shouldAnimate ? { scale: 0.97 } : undefined}>
						<Button
							variant="outline"
							size="sm"
							onClick={handleOpenFolder}
							disabled={!hostReady || busy}
						>
							{hostReady ? "Выбрать…" : "Подключение…"}
						</Button>
					</motion.div>
				</Card>
			</motion.div>

			<motion.div custom={1} variants={cardVariants}>
				<Card className="gap-4 p-5">
					<div className="flex items-center gap-4">
						<ProjectIcon icon={<LuGitBranch className="size-4.5" />} />
						<div className="min-w-0 flex-1">
							<p className="text-sm font-medium text-foreground">
								Клонировать репозиторий
							</p>
							<p className="text-xs text-muted-foreground">
								Вставьте HTTPS или SSH URL.
							</p>
						</div>
					</div>
					<form onSubmit={handleClone} className="flex items-center gap-2">
						<Input
							type="text"
							placeholder="git@github.com:org/repo.git"
							value={url}
							onChange={(e) => setUrl(e.target.value)}
							disabled={busy || !hostReady}
							className="flex-1"
						/>
						<motion.div whileTap={shouldAnimate ? { scale: 0.97 } : undefined}>
							<Button
								type="submit"
								disabled={!url.trim() || busy || !hostReady || !cloneTargetDir}
							>
								{busy ? "Клонирование…" : "Клонировать"}
							</Button>
						</motion.div>
					</form>
				</Card>
			</motion.div>
		</motion.div>
	);
}

function repoNameFromUrl(url: string): string {
	const lastSegment = url
		.trim()
		.replace(/\.git$/, "")
		.replace(/[/:]+$/, "")
		.split(/[/:]/)
		.pop();
	return lastSegment || "repo";
}

function ProjectIcon({ icon }: { icon: ReactNode }) {
	return (
		<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
			{icon}
		</div>
	);
}
