import type { SelectJournalEvent } from "@rox/db/schema";
import { AnimatedNumber } from "@rox/ui/motion";
import { cn } from "@rox/ui/utils";
import { useMemo } from "react";
import { LuActivity, LuBellRing, LuTriangleAlert } from "react-icons/lu";
import { dayKeyOf } from "../datetime";
import { eventStatus, statusBucket } from "../types";
import { ActivityHeatmap } from "./ActivityHeatmap";

interface DaySummaryRailProps {
	events: SelectJournalEvent[];
	/** Horizontal variant for the <1024px collapse (renders inline counters). */
	variant?: "rail" | "bar";
	/**
	 * Clicking a heatmap day asks the surface to scroll the reflection lane to
	 * that `YYYY-MM-DD` day. Only wired for the `rail` variant.
	 */
	onSelectDay?: (day: string) => void;
}

interface DayCounts {
	runs: number;
	errors: number;
	nudges: number;
	success: number;
	skipped: number;
}

/**
 * "Сводка дня" — animated counters over today's (UTC) events plus a small
 * status breakdown. `rail` is the ≥1024px sticky glass panel; `bar` is the
 * collapsed horizontal strip shown above the lane on narrow widths.
 */
export function DaySummaryRail({
	events,
	variant = "rail",
	onSelectDay,
}: DaySummaryRailProps) {
	const counts = useMemo<DayCounts>(() => {
		const todayKey = dayKeyOf(new Date());
		const acc: DayCounts = {
			runs: 0,
			errors: 0,
			nudges: 0,
			success: 0,
			skipped: 0,
		};
		for (const event of events) {
			if (dayKeyOf(event.createdAt) !== todayKey) continue;
			if (event.kind === "ambient_nudge") acc.nudges += 1;
			else acc.runs += 1;
			const bucket = statusBucket(eventStatus(event));
			if (bucket === "error") acc.errors += 1;
			else if (bucket === "success") acc.success += 1;
			else if (bucket === "skipped") acc.skipped += 1;
		}
		return acc;
	}, [events]);

	if (variant === "bar") {
		return (
			<div className="glass-panel flex items-center gap-4 rounded-lg border border-border/50 px-4 py-2.5 lg:hidden">
				<InlineStat
					icon={<LuActivity className="size-3.5 text-sky-500" />}
					value={counts.runs}
					label="запусков"
				/>
				<InlineStat
					icon={<LuTriangleAlert className="size-3.5 text-red-500" />}
					value={counts.errors}
					label="ошибок"
				/>
				<InlineStat
					icon={<LuBellRing className="size-3.5 text-emerald-500" />}
					value={counts.nudges}
					label="подсказок"
				/>
			</div>
		);
	}

	return (
		<aside className="sticky top-0 hidden h-fit lg:block">
			<div className="glass-panel rounded-xl border border-border/60 p-4">
				<h2 className="font-mono text-[11px] text-muted-foreground uppercase tracking-[0.18em]">
					Сводка дня
				</h2>
				<div className="mt-4 space-y-3">
					<StatRow
						icon={<LuActivity className="size-4 text-sky-500" />}
						value={counts.runs}
						label="Запусков"
					/>
					<StatRow
						icon={<LuTriangleAlert className="size-4 text-red-500" />}
						value={counts.errors}
						label="Ошибок"
						accent={counts.errors > 0}
					/>
					<StatRow
						icon={<LuBellRing className="size-4 text-emerald-500" />}
						value={counts.nudges}
						label="Подсказок"
					/>
				</div>

				<div className="mt-4 border-border/50 border-t pt-3">
					<p className="mb-2 text-[10px] text-muted-foreground uppercase tracking-wider">
						По статусам
					</p>
					<div className="space-y-1.5">
						<BreakdownRow
							color="bg-emerald-500"
							label="Успех"
							value={counts.success}
						/>
						<BreakdownRow
							color="bg-red-500"
							label="Ошибка"
							value={counts.errors}
						/>
						<BreakdownRow
							color="bg-muted-foreground"
							label="Пропущено"
							value={counts.skipped}
						/>
					</div>
				</div>

				<div className="mt-4 border-border/50 border-t pt-3">
					<p className="mb-2 text-[10px] text-muted-foreground uppercase tracking-wider">
						Активность
					</p>
					<ActivityHeatmap events={events} onSelectDay={onSelectDay ?? noop} />
				</div>
			</div>
		</aside>
	);
}

function noop() {}

function StatRow({
	icon,
	value,
	label,
	accent,
}: {
	icon: React.ReactNode;
	value: number;
	label: string;
	accent?: boolean;
}) {
	return (
		<div className="flex items-center justify-between gap-3">
			<span className="flex items-center gap-2 text-muted-foreground text-xs">
				{icon}
				{label}
			</span>
			<AnimatedNumber
				value={value}
				className={cn(
					"font-mono text-lg tabular-nums",
					accent ? "text-red-500" : "text-foreground",
				)}
			/>
		</div>
	);
}

function BreakdownRow({
	color,
	label,
	value,
}: {
	color: string;
	label: string;
	value: number;
}) {
	return (
		<div className="flex items-center justify-between gap-2">
			<span className="flex items-center gap-1.5 text-muted-foreground text-xs">
				<span className={cn("size-1.5 rounded-full", color)} aria-hidden />
				{label}
			</span>
			<AnimatedNumber
				value={value}
				className="font-mono text-muted-foreground text-xs tabular-nums"
			/>
		</div>
	);
}

function InlineStat({
	icon,
	value,
	label,
}: {
	icon: React.ReactNode;
	value: number;
	label: string;
}) {
	return (
		<span className="flex items-center gap-1.5">
			{icon}
			<AnimatedNumber
				value={value}
				className="font-mono text-foreground text-sm tabular-nums"
			/>
			<span className="text-muted-foreground text-xs">{label}</span>
		</span>
	);
}
