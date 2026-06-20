import {
	AlertDialog,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@rox/ui/alert-dialog";
import { Button } from "@rox/ui/button";
import { Label } from "@rox/ui/label";
import { toast } from "@rox/ui/sonner";
import { useMemo, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

export function SessionsSection() {
	const utils = electronTrpc.useUtils();

	const { data: daemonSessions } =
		electronTrpc.terminal.listDaemonSessions.useQuery();
	const sessions = daemonSessions?.sessions ?? [];
	const aliveSessions = useMemo(
		() => sessions.filter((session) => session.isAlive),
		[sessions],
	);
	const sessionsSorted = useMemo(() => {
		return [...aliveSessions].sort((a, b) => {
			if (a.attachedClients !== b.attachedClients) {
				return b.attachedClients - a.attachedClients;
			}
			const aTime = a.lastAttachedAt ? Date.parse(a.lastAttachedAt) : 0;
			const bTime = b.lastAttachedAt ? Date.parse(b.lastAttachedAt) : 0;
			return bTime - aTime;
		});
	}, [aliveSessions]);

	const [confirmKillAllOpen, setConfirmKillAllOpen] = useState(false);
	const [confirmClearHistoryOpen, setConfirmClearHistoryOpen] = useState(false);
	const [confirmRestartDaemonOpen, setConfirmRestartDaemonOpen] =
		useState(false);
	const [showSessionList, setShowSessionList] = useState(false);
	const [pendingKillSession, setPendingKillSession] = useState<{
		sessionId: string;
		workspaceId: string;
	} | null>(null);

	const killAllDaemonSessions =
		electronTrpc.terminal.killAllDaemonSessions.useMutation({
			onMutate: async () => {
				await utils.terminal.listDaemonSessions.cancel();
				const previous = utils.terminal.listDaemonSessions.getData();
				utils.terminal.listDaemonSessions.setData(undefined, {
					sessions: [],
				});
				return { previous };
			},
			onSuccess: (result) => {
				if (result.remainingCount > 0) {
					toast.warning("Некоторые сеансы не удалось завершить", {
						description: `Завершено: ${result.killedCount}, осталось: ${result.remainingCount}`,
					});
				} else {
					toast.success("Все сеансы терминала завершены", {
						description: `Завершено сеансов: ${result.killedCount}`,
					});
				}
			},
			onError: (error, _vars, context) => {
				if (context?.previous) {
					utils.terminal.listDaemonSessions.setData(
						undefined,
						context.previous,
					);
				}
				toast.error("Не удалось завершить сеансы", {
					description: error.message,
				});
			},
			onSettled: () => {
				setTimeout(() => {
					utils.terminal.listDaemonSessions.invalidate();
				}, 300);
			},
		});

	const clearTerminalHistory =
		electronTrpc.terminal.clearTerminalHistory.useMutation({
			onSuccess: () => {
				toast.success("История терминала очищена");
				utils.terminal.listDaemonSessions.invalidate();
			},
			onError: (error) => {
				toast.error("Не удалось очистить историю терминала", {
					description: error.message,
				});
			},
		});

	const killDaemonSession = electronTrpc.terminal.kill.useMutation({
		onSuccess: () => {
			toast.success("Сеанс терминала завершен");
			utils.terminal.listDaemonSessions.invalidate();
		},
		onError: (error) => {
			toast.error("Не удалось завершить сеанс", {
				description: error.message,
			});
		},
	});

	const restartDaemon = electronTrpc.terminal.restartDaemon.useMutation({
		onSuccess: () => {
			toast.success("Служба терминала перезапущена", {
				description:
					"Все сеансы завершены, служба терминала перезапущена. Приложение будет использовать новую службу.",
			});
			utils.terminal.listDaemonSessions.invalidate();
		},
		onError: (error) => {
			toast.error("Не удалось перезапустить службу терминала", {
				description: error.message,
			});
		},
	});

	const formatTimestamp = (value?: string) => {
		if (!value) return "—";
		return value.replace("T", " ").replace(/\.\d+Z$/, "Z");
	};

	return (
		<>
			<div className="rounded-md border border-border/60 p-4 space-y-3">
				<div className="space-y-0.5">
					<div className="flex items-center justify-between">
						<Label className="text-sm font-medium">Служба терминала</Label>
						<Button
							variant="ghost"
							size="sm"
							onClick={() => utils.terminal.listDaemonSessions.invalidate()}
						>
							Обновить
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						Активных сеансов службы терминала: {aliveSessions.length}
					</p>
					{aliveSessions.length >= 20 && (
						<p className="text-xs text-muted-foreground/70">
							Большое количество постоянных терминалов может повышать нагрузку
							на CPU и память. Если заметите замедления, завершите старые
							сеансы.
						</p>
					)}
				</div>

				<div className="flex flex-wrap gap-2">
					<Button
						variant="destructive"
						size="sm"
						disabled={
							aliveSessions.length === 0 || killAllDaemonSessions.isPending
						}
						onClick={() => setConfirmKillAllOpen(true)}
					>
						Завершить все сеансы
					</Button>
					<Button
						variant="secondary"
						size="sm"
						disabled={
							aliveSessions.length === 0 || clearTerminalHistory.isPending
						}
						onClick={() => setConfirmClearHistoryOpen(true)}
					>
						Очистить историю терминала
					</Button>
					<Button
						variant="outline"
						size="sm"
						disabled={restartDaemon.isPending}
						onClick={() => setConfirmRestartDaemonOpen(true)}
					>
						Перезапустить службу
					</Button>
					<Button
						variant="ghost"
						size="sm"
						disabled={aliveSessions.length === 0}
						onClick={() => setShowSessionList((v) => !v)}
					>
						{showSessionList ? "Скрыть сеансы" : "Показать сеансы"}
					</Button>
				</div>

				{showSessionList && aliveSessions.length > 0 && (
					<div className="rounded-md border border-border/60 overflow-hidden">
						<div className="max-h-64 overflow-auto">
							<table className="w-full text-xs">
								<thead className="sticky top-0 bg-background">
									<tr className="text-muted-foreground">
										<th className="px-2 py-2 text-left font-medium">
											Рабочая область
										</th>
										<th className="px-2 py-2 text-left font-medium">Сеанс</th>
										<th className="px-2 py-2 text-right font-medium">
											Клиенты
										</th>
										<th className="px-2 py-2 text-right font-medium">PID</th>
										<th className="px-2 py-2 text-left font-medium">
											Последнее подключение
										</th>
										<th className="px-2 py-2 text-right font-medium">
											Действие
										</th>
									</tr>
								</thead>
								<tbody className="divide-y divide-border/60">
									{sessionsSorted.map((session) => (
										<tr key={session.sessionId} className="hover:bg-muted/30">
											<td className="px-2 py-2 font-mono">
												{session.workspaceId}
											</td>
											<td className="px-2 py-2 font-mono">
												{session.sessionId}
											</td>
											<td className="px-2 py-2 text-right">
												{session.attachedClients}
											</td>
											<td className="px-2 py-2 text-right font-mono">
												{session.pid ?? "—"}
											</td>
											<td className="px-2 py-2">
												{formatTimestamp(session.lastAttachedAt)}
											</td>
											<td className="px-2 py-2 text-right">
												<Button
													variant="ghost"
													size="sm"
													onClick={() =>
														setPendingKillSession({
															sessionId: session.sessionId,
															workspaceId: session.workspaceId,
														})
													}
												>
													Завершить
												</Button>
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</div>
				)}
			</div>

			<AlertDialog
				open={confirmKillAllOpen}
				onOpenChange={setConfirmKillAllOpen}
			>
				<AlertDialogContent className="max-w-[520px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							Завершить все сеансы терминала?
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-muted-foreground space-y-1.5">
								<span className="block">
									Это завершит все постоянные процессы терминала: сборки, тесты,
									агентов и другие процессы.
								</span>
								<span className="block">
									Это действие нельзя отменить. Панели терминала покажут
									«Process exited», после чего их можно будет запустить заново.
								</span>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setConfirmKillAllOpen(false)}
						>
							Отмена
						</Button>
						<Button
							variant="destructive"
							size="sm"
							disabled={killAllDaemonSessions.isPending}
							onClick={() => {
								setConfirmKillAllOpen(false);
								killAllDaemonSessions.mutate();
							}}
						>
							Завершить все
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={confirmClearHistoryOpen}
				onOpenChange={setConfirmClearHistoryOpen}
			>
				<AlertDialogContent className="max-w-[520px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							Очистить историю терминала?
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-muted-foreground space-y-1.5">
								<span className="block">
									Это удалит сохраненный буфер прокрутки, который используется
									для восстановления после перезагрузки или сбоя.
								</span>
								<span className="block">
									Запущенные процессы терминала продолжат работать, но старый
									вывод может стать недоступен после перезапуска приложения.
								</span>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setConfirmClearHistoryOpen(false)}
						>
							Отмена
						</Button>
						<Button
							variant="secondary"
							size="sm"
							disabled={clearTerminalHistory.isPending}
							onClick={() => {
								setConfirmClearHistoryOpen(false);
								clearTerminalHistory.mutate();
							}}
						>
							Очистить историю
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={!!pendingKillSession}
				onOpenChange={(open) => {
					if (!open) setPendingKillSession(null);
				}}
			>
				<AlertDialogContent className="max-w-[520px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							Завершить сеанс терминала?
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-muted-foreground space-y-1.5">
								<span className="block">
									Это завершит сеанс и связанный с ним процесс.
								</span>
								{pendingKillSession && (
									<span className="block font-mono text-xs">
										{pendingKillSession.workspaceId} /{" "}
										{pendingKillSession.sessionId}
									</span>
								)}
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setPendingKillSession(null)}
						>
							Отмена
						</Button>
						<Button
							variant="destructive"
							size="sm"
							disabled={killDaemonSession.isPending}
							onClick={() => {
								const sessionId = pendingKillSession?.sessionId;
								setPendingKillSession(null);
								if (!sessionId) return;
								killDaemonSession.mutate({ paneId: sessionId });
							}}
						>
							Завершить
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			<AlertDialog
				open={confirmRestartDaemonOpen}
				onOpenChange={setConfirmRestartDaemonOpen}
			>
				<AlertDialogContent className="max-w-[520px] gap-0 p-0">
					<AlertDialogHeader className="px-4 pt-4 pb-2">
						<AlertDialogTitle className="font-medium">
							Перезапустить службу терминала?
						</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="text-muted-foreground space-y-1.5">
								<span className="block">
									Это завершит все запущенные сеансы и перезапустит службу
									терминала. Приложение откроет терминалы через новую службу.
								</span>
								<span className="block">
									Используйте это, если терминалы зависли или не отвечают.
								</span>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter className="px-4 pb-4 pt-2 flex-row justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => setConfirmRestartDaemonOpen(false)}
						>
							Отмена
						</Button>
						<Button
							variant="default"
							size="sm"
							disabled={restartDaemon.isPending}
							onClick={() => {
								setConfirmRestartDaemonOpen(false);
								restartDaemon.mutate(undefined, {});
							}}
						>
							Перезапустить службу
						</Button>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
