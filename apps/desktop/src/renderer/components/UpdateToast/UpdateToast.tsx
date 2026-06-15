import { COMPANY } from "@rox/shared/constants";
import { Button } from "@rox/ui/button";
import { toast } from "@rox/ui/sonner";
import { AnimatePresence, motion } from "framer-motion";
import { HiArrowPath, HiMiniXMark } from "react-icons/hi2";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { MotionToast, ProgressBar } from "renderer/motion";
import { ease, motionDuration } from "renderer/motion/tokens";
import { useShouldAnimate } from "renderer/motion/useMotionPreference";
import { AUTO_UPDATE_STATUS } from "shared/auto-update";

interface UpdateToastProps {
	toastId: string | number;
	status: "downloading" | "ready" | "error" | "update-available";
	version?: string;
	error?: string;
	/** Arch-correct .dmg URL for notify-only (unsigned macOS) updates. */
	downloadUrl?: string;
	/** Release notes / releases page URL for notify-only updates. */
	notesUrl?: string;
}

export function UpdateToast({
	toastId,
	status,
	version,
	error,
	downloadUrl,
	notesUrl,
}: UpdateToastProps) {
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const installMutation = electronTrpc.autoUpdate.install.useMutation();
	const dismissMutation = electronTrpc.autoUpdate.dismiss.useMutation({
		onSuccess: () => {
			toast.dismiss(toastId);
		},
	});

	const isDownloading = status === AUTO_UPDATE_STATUS.DOWNLOADING;
	const isReady = status === AUTO_UPDATE_STATUS.READY;
	const isError = status === AUTO_UPDATE_STATUS.ERROR;
	// Notify-only state for unsigned macOS builds: prompt a manual download
	// instead of a Squirrel auto-install.
	const isUpdateAvailable = status === AUTO_UPDATE_STATUS.UPDATE_AVAILABLE;

	const shouldAnimate = useShouldAnimate("decorative");

	const handleSeeChanges = () => {
		openUrl.mutate(notesUrl ?? COMPANY.CHANGELOG_URL);
	};

	const handleInstall = () => {
		installMutation.mutate();
	};

	// «Обновить» for notify-only: open the .dmg in the browser. The main-process
	// install handler already does this for the UPDATE_AVAILABLE state, but call
	// openUrl directly when we have the arch URL so behavior is explicit.
	const handleDownload = () => {
		if (downloadUrl) {
			openUrl.mutate(downloadUrl);
			dismissMutation.mutate();
			return;
		}
		installMutation.mutate();
	};

	const handleLater = () => {
		dismissMutation.mutate();
	};

	return (
		<MotionToast>
			<div className="update-toast relative flex flex-col gap-3 bg-popover text-popover-foreground rounded-lg border border-border p-4 shadow-lg min-w-[340px]">
				<button
					type="button"
					onClick={handleLater}
					className="absolute top-2 right-2 size-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted"
					aria-label="Закрыть"
				>
					<HiMiniXMark className="size-4" />
				</button>
				<div className="flex flex-col gap-0.5">
					{isError ? (
						<>
							<span className="font-medium text-sm text-destructive">
								Обновление не удалось
							</span>
							<span className="text-sm text-muted-foreground">
								{error || "Повторите попытку позже"}
							</span>
						</>
					) : isUpdateAvailable ? (
						<>
							<span className="font-medium text-sm">Доступно обновление</span>
							<span className="text-sm text-muted-foreground">
								{version
									? `Версия ${version} готова к загрузке`
									: "Доступна новая версия"}
							</span>
							<span className="text-xs text-muted-foreground/70">
								Скачайте установщик и обновите приложение вручную.
							</span>
						</>
					) : isDownloading ? (
						<>
							<span className="font-medium text-sm">
								Загрузка обновления...
							</span>
							<span className="text-sm text-muted-foreground">
								{version ? `Версия ${version}` : "Подождите"}
							</span>
							<ProgressBar className="mt-1" />
						</>
					) : (
						<>
							<span className="font-medium text-sm">Доступно обновление</span>
							<span className="text-sm text-muted-foreground">
								{version
									? `Версия ${version} готова к установке`
									: "Готово к установке"}
							</span>
							<span className="text-xs text-muted-foreground/70">
								Терминальные сессии не будут прерваны.
							</span>
						</>
					)}
				</div>
				<AnimatePresence initial={false}>
					{isUpdateAvailable && (
						<motion.div
							key="available-actions"
							initial={{ opacity: 0, height: 0, y: -4 }}
							animate={{ opacity: 1, height: "auto", y: 0 }}
							exit={{ opacity: 0, height: 0, y: -4 }}
							transition={
								shouldAnimate
									? {
											duration: motionDuration.base,
											ease: ease.standard as [number, number, number, number],
										}
									: { duration: 0 }
							}
							style={{ overflow: "hidden" }}
						>
							<div className="flex items-center gap-2">
								<Button variant="ghost" size="sm" onClick={handleLater}>
									Позже
								</Button>
								<Button size="sm" onClick={handleDownload}>
									Обновить
								</Button>
							</div>
						</motion.div>
					)}
					{isReady && (
						<motion.div
							key="ready-actions"
							initial={{ opacity: 0, height: 0, y: -4 }}
							animate={{ opacity: 1, height: "auto", y: 0 }}
							exit={{ opacity: 0, height: 0, y: -4 }}
							transition={
								shouldAnimate
									? {
											duration: motionDuration.base,
											ease: ease.standard as [number, number, number, number],
										}
									: { duration: 0 }
							}
							style={{ overflow: "hidden" }}
						>
							<div className="flex items-center gap-2">
								<Button variant="ghost" size="sm" onClick={handleSeeChanges}>
									Что изменилось
								</Button>
								<Button
									size="sm"
									onClick={handleInstall}
									disabled={installMutation.isPending}
								>
									{installMutation.isPending && (
										<HiArrowPath className="size-3.5 animate-spin" />
									)}
									{installMutation.isPending ? "Установка..." : "Установить"}
								</Button>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</MotionToast>
	);
}
