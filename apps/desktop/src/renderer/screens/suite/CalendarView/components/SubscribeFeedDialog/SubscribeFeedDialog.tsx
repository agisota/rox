import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@rox/ui/dialog";
import { Label } from "@rox/ui/label";
import { toast } from "@rox/ui/sonner";
import { Switch } from "@rox/ui/switch";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Rss } from "lucide-react";
import { useEffect, useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import { logger } from "renderer/lib/logger";

interface SubscribeFeedDialogProps {
	calendarId: string;
	feedEnabled: boolean;
	feedBusyOnly: boolean;
}

/**
 * Owner-only public ICS subscribe control for the desktop calendar (parity with
 * web). The subscribe URL is built server-side and returned by the
 * enable/rotate mutations — never reconstructed in the renderer (avoids guessing
 * the wrong origin). The raw token is a secret, held only in local state for the
 * current session; a fresh load with an enabled feed requires a rotate/re-enable
 * to reveal the URL again.
 */
export function SubscribeFeedDialog({
	calendarId,
	feedEnabled,
	feedBusyOnly,
}: SubscribeFeedDialogProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [url, setUrl] = useState<string | null>(null);
	const [busyOnly, setBusyOnly] = useState(feedBusyOnly);
	const [copied, setCopied] = useState(false);

	useEffect(() => setBusyOnly(feedBusyOnly), [feedBusyOnly]);

	const refresh = async () => {
		await queryClient.invalidateQueries({
			queryKey: trpc.calendar.listCalendars.queryKey(),
		});
	};

	const enableFeed = useMutation(
		trpc.calendar.enableCalendarFeed.mutationOptions({
			onSuccess: async (data) => {
				setUrl(data.url);
				await refresh();
				toast.success("Публичная подписка включена");
			},
			onError: (error) => {
				logger.error("[CalendarView] enableCalendarFeed failed", error);
				toast.error("Не удалось включить подписку");
			},
		}),
	);

	const disableFeed = useMutation(
		trpc.calendar.disableCalendarFeed.mutationOptions({
			onSuccess: async () => {
				setUrl(null);
				await refresh();
				toast.success("Публичная подписка отключена");
			},
			onError: (error) => {
				logger.error("[CalendarView] disableCalendarFeed failed", error);
				toast.error("Не удалось отключить подписку");
			},
		}),
	);

	const rotateFeed = useMutation(
		trpc.calendar.rotateCalendarFeed.mutationOptions({
			onSuccess: async (data) => {
				setUrl(data.url);
				await refresh();
				toast.success("Ссылка подписки обновлена");
			},
			onError: (error) => {
				logger.error("[CalendarView] rotateCalendarFeed failed", error);
				toast.error("Не удалось обновить ссылку");
			},
		}),
	);

	const pending =
		enableFeed.isPending || disableFeed.isPending || rotateFeed.isPending;

	const handleToggleEnabled = (next: boolean) => {
		if (next) enableFeed.mutate({ calendarId, busyOnly });
		else disableFeed.mutate({ calendarId });
	};

	const handleToggleBusyOnly = (next: boolean) => {
		setBusyOnly(next);
		if (feedEnabled) enableFeed.mutate({ calendarId, busyOnly: next });
	};

	const handleCopy = async () => {
		if (!url) return;
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			toast.success("Ссылка скопирована");
			setTimeout(() => setCopied(false), 1500);
		} catch (error) {
			logger.error("[CalendarView] clipboard write failed", error);
			toast.error("Не удалось скопировать ссылку");
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					size="icon"
					variant="ghost"
					aria-label="Публичная подписка (.ics)"
					title="Публичная подписка (.ics)"
				>
					<Rss className="size-4" />
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Публичная подписка</DialogTitle>
					<DialogDescription>
						Ссылка для подписки на календарь в Apple/Google/Outlook. Доступна
						всем, у кого есть ссылка.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<Label htmlFor="desktop-feed-enabled" className="text-sm">
							Включить подписку
						</Label>
						<Switch
							id="desktop-feed-enabled"
							checked={feedEnabled}
							disabled={pending}
							onCheckedChange={handleToggleEnabled}
						/>
					</div>

					<div className="flex items-center justify-between">
						<Label htmlFor="desktop-feed-busy-only" className="text-sm">
							Только занятость (без деталей)
						</Label>
						<Switch
							id="desktop-feed-busy-only"
							checked={busyOnly}
							disabled={pending}
							onCheckedChange={handleToggleBusyOnly}
						/>
					</div>

					{feedEnabled && url && (
						<div className="space-y-1.5">
							<Label className="text-muted-foreground text-xs">Ссылка</Label>
							<div className="flex items-center gap-2">
								<code className="min-w-0 flex-1 cursor-text select-text truncate rounded bg-muted px-2 py-1.5 text-xs">
									{url}
								</code>
								<Button
									variant="outline"
									size="icon"
									className="shrink-0"
									aria-label="Скопировать ссылку"
									onClick={handleCopy}
								>
									{copied ? (
										<Check className="size-4" />
									) : (
										<Copy className="size-4" />
									)}
								</Button>
							</div>
						</div>
					)}

					{feedEnabled && !url && (
						<p className="cursor-text select-text text-muted-foreground text-xs">
							Ссылка скрыта в целях безопасности. Обновите ссылку, чтобы
							показать её снова.
						</p>
					)}

					{feedEnabled && (
						<Button
							variant="outline"
							size="sm"
							className="w-full"
							disabled={pending}
							onClick={() => rotateFeed.mutate({ calendarId })}
						>
							Обновить ссылку
						</Button>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
