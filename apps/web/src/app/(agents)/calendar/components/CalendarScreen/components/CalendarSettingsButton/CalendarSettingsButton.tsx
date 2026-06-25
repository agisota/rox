"use client";

import {
	buildCalendarUpdateInput,
	CALENDAR_SHARE_ROLE_LABELS,
	CALENDAR_SHARE_ROLE_OPTIONS,
	type CalendarShareRole,
} from "@rox/shared/calendar-share";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@rox/ui/alert-dialog";
import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@rox/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { useQuery } from "@tanstack/react-query";
import { Settings2, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTRPC } from "@/trpc/react";
import { useCalendarActions } from "../../../../hooks/useCalendarActions";

interface CalendarSettingsButtonProps {
	calendar: {
		id: string;
		name: string;
		color: string | null;
		timezone: string;
		ownerUserId: string;
	};
	/** Whether the current user owns this calendar (gates delete + sharing). */
	isOwner: boolean;
}

/**
 * Per-calendar settings popover (web parity with the desktop
 * `CalendarSettingsPopover`). Rename/recolor/re-timezone via `updateCalendar`,
 * and (owner only) delete via `deleteCalendar` or manage ACL sharing via
 * `shareCalendar`/`unshareCalendar` + `listShares`. The update payload is built
 * by the shared `@rox/shared/calendar-share` core so every surface behaves the
 * same; `listCalendars` is invalidated by `useCalendarActions` after each write.
 */
export function CalendarSettingsButton({
	calendar,
	isOwner,
}: CalendarSettingsButtonProps) {
	const trpc = useTRPC();
	const { updateCalendar, deleteCalendar, shareCalendar, unshareCalendar } =
		useCalendarActions();

	const [open, setOpen] = useState(false);
	const [name, setName] = useState(calendar.name);
	const [color, setColor] = useState(calendar.color ?? "");
	const [timezone, setTimezone] = useState(calendar.timezone);

	useEffect(() => {
		if (open) {
			setName(calendar.name);
			setColor(calendar.color ?? "");
			setTimezone(calendar.timezone);
		}
	}, [open, calendar.name, calendar.color, calendar.timezone]);

	const sharesQuery = useQuery({
		...trpc.calendar.listShares.queryOptions({ calendarId: calendar.id }),
		enabled: open && isOwner,
	});
	const shares = sharesQuery.data ?? [];

	const membersQuery = useQuery({
		...trpc.organization.members.list.queryOptions({ limit: 100 }),
		enabled: open && isOwner,
	});

	const sharedUserIds = useMemo(
		() => new Set(shares.map((s) => s.userId)),
		[shares],
	);
	const shareCandidates = useMemo(
		() =>
			(membersQuery.data ?? []).filter(
				(m) => m.id !== calendar.ownerUserId && !sharedUserIds.has(m.id),
			),
		[membersQuery.data, calendar.ownerUserId, sharedUserIds],
	);

	const [shareUserId, setShareUserId] = useState("");
	const [shareRole, setShareRole] = useState<CalendarShareRole>("reader");

	const memberName = (userId: string) => {
		const m = (membersQuery.data ?? []).find((x) => x.id === userId);
		return m?.name || m?.email || userId;
	};

	const handleSave = () => {
		const input = buildCalendarUpdateInput(
			calendar.id,
			{ name, color, timezone },
			{
				name: calendar.name,
				color: calendar.color,
				timezone: calendar.timezone,
			},
		);
		if (!input) {
			setOpen(false);
			return;
		}
		updateCalendar.mutate(input, { onSuccess: () => setOpen(false) });
	};

	const handleShare = () => {
		if (!shareUserId) return;
		shareCalendar.mutate(
			{ calendarId: calendar.id, userId: shareUserId, role: shareRole },
			{
				onSuccess: () => {
					setShareUserId("");
					setShareRole("reader");
				},
			},
		);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					size="icon"
					variant="outline"
					aria-label="Настройки календаря"
					title="Настройки календаря"
				>
					<Settings2 className="size-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-80 space-y-4">
				<div className="space-y-3">
					<p className="font-medium text-muted-foreground text-xs">
						Настройки календаря
					</p>
					<div className="space-y-1.5">
						<Label htmlFor="web-cal-name" className="text-xs">
							Название
						</Label>
						<Input
							id="web-cal-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="Название календаря"
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="web-cal-color" className="text-xs">
							Цвет
						</Label>
						<div className="flex items-center gap-2">
							<input
								id="web-cal-color"
								type="color"
								value={color || "#3b82f6"}
								onChange={(e) => setColor(e.target.value)}
								className="size-9 shrink-0 cursor-pointer rounded border bg-transparent"
								aria-label="Цвет календаря"
							/>
							<Input
								value={color}
								onChange={(e) => setColor(e.target.value)}
								placeholder="#3b82f6"
							/>
						</div>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="web-cal-tz" className="text-xs">
							Часовой пояс
						</Label>
						<Input
							id="web-cal-tz"
							value={timezone}
							onChange={(e) => setTimezone(e.target.value)}
							placeholder="UTC"
						/>
					</div>
					<Button
						size="sm"
						className="w-full"
						disabled={updateCalendar.isPending}
						onClick={handleSave}
					>
						Сохранить
					</Button>
				</div>

				{isOwner && (
					<div className="space-y-2 border-t pt-3">
						<p className="font-medium text-muted-foreground text-xs">Доступ</p>
						<ul className="space-y-1">
							{shares.length === 0 && (
								<li className="text-muted-foreground text-xs">
									Календарь никому не предоставлен.
								</li>
							)}
							{shares.map((s) => (
								<li key={s.userId} className="flex items-center gap-2 text-sm">
									<span className="min-w-0 flex-1 truncate">
										{memberName(s.userId)}
									</span>
									<span className="shrink-0 text-muted-foreground text-xs">
										{CALENDAR_SHARE_ROLE_LABELS[s.role as CalendarShareRole]}
									</span>
									<Button
										size="icon"
										variant="ghost"
										className="size-6 shrink-0"
										aria-label="Отозвать доступ"
										title="Отозвать доступ"
										disabled={unshareCalendar.isPending}
										onClick={() =>
											unshareCalendar.mutate({
												calendarId: calendar.id,
												userId: s.userId,
											})
										}
									>
										<X className="size-3.5" />
									</Button>
								</li>
							))}
						</ul>
						<div className="flex items-center gap-2">
							<Select value={shareUserId} onValueChange={setShareUserId}>
								<SelectTrigger className="min-w-0 flex-1" size="sm">
									<SelectValue placeholder="Выбрать пользователя" />
								</SelectTrigger>
								<SelectContent>
									{shareCandidates.length === 0 && (
										<div className="px-2 py-1.5 text-muted-foreground text-xs">
											Нет доступных участников
										</div>
									)}
									{shareCandidates.map((m) => (
										<SelectItem key={m.id} value={m.id}>
											{m.name || m.email}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Select
								value={shareRole}
								onValueChange={(v) => setShareRole(v as CalendarShareRole)}
							>
								<SelectTrigger className="w-32 shrink-0" size="sm">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CALENDAR_SHARE_ROLE_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<Button
							size="sm"
							variant="outline"
							className="w-full"
							disabled={!shareUserId || shareCalendar.isPending}
							onClick={handleShare}
						>
							Предоставить доступ
						</Button>
					</div>
				)}

				{isOwner && (
					<div className="border-t pt-3">
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button
									size="sm"
									variant="destructive"
									className="w-full"
									disabled={deleteCalendar.isPending}
								>
									<Trash2 className="mr-1.5 size-4" /> Удалить календарь
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>Удалить календарь?</AlertDialogTitle>
									<AlertDialogDescription>
										Календарь «{calendar.name}» и все его события будут удалены
										безвозвратно.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>Отмена</AlertDialogCancel>
									<AlertDialogAction
										onClick={() => {
											deleteCalendar.mutate(
												{ calendarId: calendar.id },
												{ onSuccess: () => setOpen(false) },
											);
										}}
									>
										Удалить
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}
