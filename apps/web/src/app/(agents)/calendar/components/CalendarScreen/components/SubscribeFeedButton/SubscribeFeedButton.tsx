"use client";

import { Button } from "@rox/ui/button";
import { Label } from "@rox/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@rox/ui/popover";
import { toast } from "@rox/ui/sonner";
import { Switch } from "@rox/ui/switch";
import { Check, Copy, Rss } from "lucide-react";
import { useEffect, useState } from "react";
import { useCalendarActions } from "../../../../hooks/useCalendarActions";

interface SubscribeFeedButtonProps {
	calendarId: string;
	/** Whether the public feed is currently enabled (from `listCalendars`). */
	feedEnabled: boolean;
	/** Whether the enabled feed is the free-busy-only variant. */
	feedBusyOnly: boolean;
}

/**
 * Owner-only public ICS subscribe control. A calendar's feed is an
 * always-on subscribe URL (Apple/Google/Outlook) gated by an unguessable token.
 * The URL is returned by the enable/rotate mutations (server-built from
 * `NEXT_PUBLIC_API_URL`) — never reconstructed client-side. The raw token is a
 * secret, so it is only held in local state for the current session after an
 * enable/rotate; on a fresh load with an already-enabled feed the owner must
 * rotate (or re-enable) to reveal the URL again.
 */
export function SubscribeFeedButton({
	calendarId,
	feedEnabled,
	feedBusyOnly,
}: SubscribeFeedButtonProps) {
	const { enableCalendarFeed, disableCalendarFeed, rotateCalendarFeed } =
		useCalendarActions();
	const [open, setOpen] = useState(false);
	const [url, setUrl] = useState<string | null>(null);
	const [busyOnly, setBusyOnly] = useState(feedBusyOnly);
	const [copied, setCopied] = useState(false);

	// Keep the local busy-only toggle in sync with the persisted value.
	useEffect(() => setBusyOnly(feedBusyOnly), [feedBusyOnly]);

	const pending =
		enableCalendarFeed.isPending ||
		disableCalendarFeed.isPending ||
		rotateCalendarFeed.isPending;

	const handleEnable = (nextBusyOnly: boolean) => {
		enableCalendarFeed.mutate(
			{ calendarId, busyOnly: nextBusyOnly },
			{ onSuccess: (data) => setUrl(data.url) },
		);
	};

	const handleDisable = () => {
		disableCalendarFeed.mutate(
			{ calendarId },
			{ onSuccess: () => setUrl(null) },
		);
	};

	const handleRotate = () => {
		rotateCalendarFeed.mutate(
			{ calendarId },
			{ onSuccess: (data) => setUrl(data.url) },
		);
	};

	const handleToggleEnabled = (next: boolean) => {
		if (next) handleEnable(busyOnly);
		else handleDisable();
	};

	const handleToggleBusyOnly = (next: boolean) => {
		setBusyOnly(next);
		// Re-apply the variant only when the feed is already enabled.
		if (feedEnabled) handleEnable(next);
	};

	const handleCopy = async () => {
		if (!url) return;
		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			toast.success("Ссылка скопирована");
			setTimeout(() => setCopied(false), 1500);
		} catch {
			toast.error("Не удалось скопировать ссылку");
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					variant="outline"
					size="icon"
					aria-label="Публичная подписка (.ics)"
					title="Публичная подписка (.ics)"
				>
					<Rss className="size-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 space-y-4">
				<div className="space-y-1">
					<h3 className="font-medium text-sm">Публичная подписка</h3>
					<p className="text-muted-foreground text-xs">
						Ссылка для подписки на календарь в Apple/Google/Outlook. Доступна
						всем, у кого есть ссылка.
					</p>
				</div>

				<div className="flex items-center justify-between">
					<Label htmlFor="feed-enabled" className="text-sm">
						Включить подписку
					</Label>
					<Switch
						id="feed-enabled"
						checked={feedEnabled}
						disabled={pending}
						onCheckedChange={handleToggleEnabled}
					/>
				</div>

				<div className="flex items-center justify-between">
					<Label htmlFor="feed-busy-only" className="text-sm">
						Только занятость (без деталей)
					</Label>
					<Switch
						id="feed-busy-only"
						checked={busyOnly}
						disabled={pending}
						onCheckedChange={handleToggleBusyOnly}
					/>
				</div>

				{feedEnabled && url && (
					<div className="space-y-1.5">
						<Label className="text-muted-foreground text-xs">Ссылка</Label>
						<div className="flex items-center gap-2">
							<code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-xs">
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
					<p className="text-muted-foreground text-xs">
						Ссылка скрыта в целях безопасности. Обновите ссылку, чтобы показать
						её снова.
					</p>
				)}

				{feedEnabled && (
					<Button
						variant="outline"
						size="sm"
						className="w-full"
						disabled={pending}
						onClick={handleRotate}
					>
						Обновить ссылку
					</Button>
				)}
			</PopoverContent>
		</Popover>
	);
}
