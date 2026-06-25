import { chatServiceTrpc } from "@rox/chat/client";
import { DESKTOP_CAPABILITIES } from "@rox/shared/wizard";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { DrawnCheck, motionDuration, useShouldAnimate } from "@rox/ui/motion";
import { toast } from "@rox/ui/sonner";
import { Spinner } from "@rox/ui/spinner";
import { cn } from "@rox/ui/utils";
import { createFileRoute } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode, useState } from "react";
import { FaAws } from "react-icons/fa";
import { HiArrowUpRight } from "react-icons/hi2";
import { SiGithub, SiOpenai } from "react-icons/si";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { GhAuthDialog } from "./components/GhAuthDialog";
import {
	type Provider,
	ProviderConnectModal,
} from "./components/ProviderConnectModal";
import { ClaudeLogo } from "./providers/components/ClaudeLogo";

export const Route = createFileRoute("/_authenticated/onboarding/")({
	component: OnboardingDashboardPage,
});

const rowVariants = {
	hidden: { opacity: 0, y: 6 },
	show: (i: number) => ({
		opacity: 1,
		y: 0,
		transition: { duration: motionDuration.fast, delay: i * 0.06 },
	}),
};

function OnboardingDashboardPage() {
	const [connectProvider, setConnectProvider] = useState<Provider | null>(null);
	const [ghAuthOpen, setGhAuthOpen] = useState(false);
	const shouldAnimateDecorative = useShouldAnimate("decorative");
	// F48 (#637): the Electron-only dep installer is gated behind a capability
	// flag from the shared wizard core. Desktop can install git/gh in-app
	// (`true`); web/mobile hosts pass connect-only capabilities, so the same
	// system step renders connect-only (no install affordance) on those surfaces.
	const { canInstallDeps } = DESKTOP_CAPABILITIES;

	const {
		data: ghStatus,
		refetch: refetchGh,
		isFetching: isFetchingGh,
	} = electronTrpc.system.detectGhCli.useQuery();
	const {
		data: gitStatus,
		refetch: refetchGit,
		isFetching: isFetchingGit,
	} = electronTrpc.system.detectGit.useQuery();
	const {
		data: anthropicStatus,
		refetch: refetchAnthropic,
		isFetching: isFetchingAnthropic,
	} = chatServiceTrpc.auth.getAnthropicStatus.useQuery();
	const {
		data: openAIStatus,
		refetch: refetchOpenAI,
		isFetching: isFetchingOpenAI,
	} = chatServiceTrpc.auth.getOpenAIStatus.useQuery();

	const ghInstalled = ghStatus?.installed === true;
	const gitInstalled = gitStatus?.installed === true;
	const ghAuthenticated = ghInstalled && ghStatus?.authenticated === true;
	// The CLI row is "ready" only once both binaries exist and gh is logged in.
	const ghReady = ghAuthenticated && gitInstalled;
	const toolsInstalled = ghInstalled && gitInstalled;
	const claudeConnected =
		!!anthropicStatus?.authenticated && !anthropicStatus.issue;
	const codexConnected = !!openAIStatus?.authenticated && !openAIStatus.issue;

	// Auto-pull the connected GitHub account once gh is authenticated.
	const { data: githubUsername } =
		electronTrpc.system.getGitHubUsername.useQuery(undefined, {
			enabled: ghAuthenticated,
		});

	const installGitTools = electronTrpc.system.installGitTools.useMutation({
		onSuccess: async (result) => {
			// Steps that can't be auto-installed (e.g. gh via apt on Linux) carry
			// their own manual link; prefer it so we route to the right page.
			const manualStep = result.steps.find(
				(step) => step.status === "manual" && step.manualInstallUrl,
			);
			const failed = result.steps.find((step) => step.status === "failed");
			if (result.packageManagerMissing) {
				toast.error(
					"Не найден менеджер пакетов для автоустановки. Откройте инструкцию по ручной установке.",
				);
				window.open(result.manualInstallUrl, "_blank", "noopener,noreferrer");
			} else if (result.sudoUnavailable) {
				toast.error(
					"Нет прав sudo без пароля. Откройте инструкцию по ручной установке.",
				);
				window.open(result.manualInstallUrl, "_blank", "noopener,noreferrer");
			} else if (!result.ok) {
				toast.error(
					failed?.error
						? `Установка не удалась: ${failed.error}. Откройте инструкцию по ручной установке.`
						: "Не удалось установить git/gh. Откройте инструкцию по ручной установке.",
				);
				// A failed install must never be a dead end — always offer the link.
				window.open(
					manualStep?.manualInstallUrl ?? result.manualInstallUrl,
					"_blank",
					"noopener,noreferrer",
				);
			} else {
				if (manualStep) {
					// git installed, but gh needs a manual step (Linux apt has no gh).
					toast.info(
						"git установлен. GitHub CLI установите по инструкции вручную.",
					);
					window.open(
						manualStep.manualInstallUrl,
						"_blank",
						"noopener,noreferrer",
					);
				} else {
					toast.success("git и GitHub CLI установлены.");
				}
			}
			await Promise.all([refetchGit(), refetchGh()]);
		},
		onError: (error) => {
			toast.error(error.message || "Не удалось запустить установку git/gh.");
		},
	});

	const ghDescription =
		ghAuthenticated && githubUsername
			? `Аккаунт: @${githubUsername}`
			: "Клонируйте, отправляйте изменения и создавайте PR.";

	return (
		<>
			<motion.div
				className="divide-y divide-border"
				initial={shouldAnimateDecorative ? "hidden" : false}
				animate="show"
			>
				<motion.div custom={0} variants={rowVariants}>
					<OnboardingRow
						icon={<SiGithub className="size-4.5" />}
						chipClassName="bg-foreground text-background"
						name="GitHub CLI"
						description={ghDescription}
						status={rowStatus(
							isFetchingGh || isFetchingGit || installGitTools.isPending,
							ghReady,
						)}
						recommended
						actionLabel={
							toolsInstalled || !canInstallDeps ? "Войти" : "Установить"
						}
						actionPending={installGitTools.isPending}
						onAction={
							// Connect-only hosts (web/mobile) can't install dev tools, so the
							// install affordance is replaced by the connect/login path.
							toolsInstalled || !canInstallDeps
								? () => setGhAuthOpen(true)
								: () => installGitTools.mutate()
						}
						onRecheck={() => {
							void refetchGh();
							void refetchGit();
						}}
					/>
				</motion.div>
				<motion.div custom={1} variants={rowVariants}>
					<OnboardingRow
						icon={<ClaudeLogo className="size-4.5 text-white" />}
						chipClassName="bg-[#D97757]"
						name="Claude Code"
						description="Агент Anthropic для работы с кодом."
						status={rowStatus(isFetchingAnthropic, claudeConnected)}
						actionLabel="Войти"
						onAction={() => setConnectProvider("anthropic")}
						onRecheck={() => void refetchAnthropic()}
					/>
				</motion.div>
				<motion.div custom={2} variants={rowVariants}>
					<OnboardingRow
						icon={<SiOpenai className="size-4.5" />}
						chipClassName="bg-foreground text-background"
						name="Codex"
						description="Агент OpenAI для работы с кодом."
						status={rowStatus(isFetchingOpenAI, codexConnected)}
						actionLabel="Войти"
						onAction={() => setConnectProvider("openai")}
						onRecheck={() => void refetchOpenAI()}
					/>
				</motion.div>
				<motion.div custom={3} variants={rowVariants}>
					<OnboardingRow
						icon={<FaAws className="size-4.5" />}
						chipClassName="bg-foreground text-background"
						name="Другие провайдеры"
						description="Bedrock, Vertex и другие."
						status="disconnected"
						actionLabel="Документация провайдеров"
						actionIcon={<HiArrowUpRight className="size-3.5" />}
						onAction={() =>
							window.open(
								"https://docs.rox.one/providers",
								"_blank",
								"noopener,noreferrer",
							)
						}
					/>
				</motion.div>
			</motion.div>

			<ProviderConnectModal
				provider={connectProvider}
				onOpenChange={(open) => {
					if (!open) setConnectProvider(null);
				}}
			/>

			<GhAuthDialog
				open={ghAuthOpen}
				onOpenChange={setGhAuthOpen}
				onExit={() => void refetchGh()}
			/>
		</>
	);
}

type RowStatus = "loading" | "connected" | "disconnected";

function rowStatus(isFetching: boolean, connected: boolean): RowStatus {
	if (isFetching) return "loading";
	return connected ? "connected" : "disconnected";
}

interface OnboardingRowProps {
	icon: ReactNode;
	chipClassName?: string;
	name: string;
	description: string;
	status: RowStatus;
	recommended?: boolean;
	actionLabel: string;
	actionIcon?: ReactNode;
	/** When true the action button is disabled and shows a spinner. */
	actionPending?: boolean;
	onAction: () => void;
	onRecheck?: () => void;
}

function OnboardingRow({
	icon,
	chipClassName,
	name,
	description,
	status,
	recommended,
	actionLabel,
	actionIcon,
	actionPending,
	onAction,
	onRecheck,
}: OnboardingRowProps) {
	const shouldAnimateEssential = useShouldAnimate("essential");
	const shouldAnimateDecorative = useShouldAnimate("decorative");

	return (
		<div className="flex items-center gap-4 py-7 first:pt-0 last:pb-0">
			<div
				className={cn(
					"flex size-9 shrink-0 items-center justify-center rounded-md",
					chipClassName ?? "bg-muted text-foreground",
				)}
			>
				{icon}
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium text-foreground">{name}</p>
				<p className="text-xs text-muted-foreground">{description}</p>
			</div>
			<div className="flex shrink-0 items-center gap-2">
				<AnimatePresence initial={false} mode="wait">
					{status === "loading" && (
						<motion.span
							key="loading"
							className="flex items-center gap-1.5 px-3 text-sm text-muted-foreground"
							initial={shouldAnimateEssential ? { opacity: 0, y: 4 } : false}
							animate={{ opacity: 1, y: 0 }}
							exit={shouldAnimateEssential ? { opacity: 0, y: -4 } : undefined}
							transition={{ duration: motionDuration.fast }}
						>
							<motion.span
								className="flex items-center gap-1.5"
								animate={
									shouldAnimateDecorative
										? { opacity: [0.6, 1, 0.6] }
										: { opacity: 1 }
								}
								transition={
									shouldAnimateDecorative
										? { duration: 1.4, ease: "easeInOut", repeat: Infinity }
										: { duration: 0 }
								}
							>
								<Spinner className="size-3.5" />
								Проверка…
							</motion.span>
						</motion.span>
					)}
					{status === "connected" && (
						<motion.div
							key="connected"
							initial={shouldAnimateEssential ? { opacity: 0, y: 4 } : false}
							animate={{ opacity: 1, y: 0 }}
							exit={shouldAnimateEssential ? { opacity: 0, y: -4 } : undefined}
							transition={{ duration: motionDuration.fast }}
						>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								onClick={onRecheck}
								disabled={!onRecheck}
								className="text-emerald-500 hover:text-emerald-500"
							>
								<DrawnCheck className="size-3.5" />
								Подключено
							</Button>
						</motion.div>
					)}
					{status === "disconnected" && (
						<motion.div
							key="disconnected"
							className="flex items-center gap-2"
							initial={shouldAnimateEssential ? { opacity: 0, y: 4 } : false}
							animate={{ opacity: 1, y: 0 }}
							exit={shouldAnimateEssential ? { opacity: 0, y: -4 } : undefined}
							transition={{ duration: motionDuration.fast }}
						>
							{recommended && <Badge variant="outline">Рекомендуется</Badge>}
							<Button
								type="button"
								size="sm"
								onClick={onAction}
								disabled={actionPending}
							>
								{actionPending && <Spinner className="size-3.5" />}
								{actionLabel}
								{!actionPending && actionIcon}
							</Button>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}
