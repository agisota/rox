import { cn } from "../../lib/utils";

export type ActivityHeatmapDay = {
	/** UTC day in YYYY-MM-DD form. */
	date: string;
	/** Activity count for the day. */
	count: number;
};

export type ActivityHeatmapProps = {
	/**
	 * Dense, chronologically-ordered day series. Rendered GitHub-style: one
	 * column per ISO week, days flowing top (Mon) to bottom (Sun).
	 */
	days: ActivityHeatmapDay[];
	/** Optional className for the outer wrapper. */
	className?: string;
	/** Accessible label for the whole grid. */
	ariaLabel?: string;
};

const WEEKDAY_LABELS = ["Пн", "", "Ср", "", "Пт", "", ""];
const MONTH_LABELS = [
	"янв",
	"фев",
	"мар",
	"апр",
	"май",
	"июн",
	"июл",
	"авг",
	"сен",
	"окт",
	"ноя",
	"дек",
];

const LEVEL_CLASSES = [
	"bg-muted/50",
	"bg-primary/25",
	"bg-primary/45",
	"bg-primary/70",
	"bg-primary",
];

const numberFormatter = new Intl.NumberFormat("ru");

/** Monday-indexed weekday (0 = Mon ... 6 = Sun) for a YYYY-MM-DD UTC date. */
function mondayIndex(dateKey: string): number {
	const day = new Date(`${dateKey}T00:00:00Z`).getUTCDay();
	return (day + 6) % 7;
}

function activityLevel(count: number, max: number): number {
	if (count <= 0 || max <= 0) return 0;
	const ratio = count / max;
	if (ratio > 0.75) return 4;
	if (ratio > 0.5) return 3;
	if (ratio > 0.25) return 2;
	return 1;
}

type Week = {
	key: string;
	days: (ActivityHeatmapDay | null)[];
	monthLabel: string | null;
};

function buildWeeks(days: ActivityHeatmapDay[]): Week[] {
	const firstDay = days[0];
	if (!firstDay) return [];

	const weeks: Week[] = [];
	let current: (ActivityHeatmapDay | null)[] = [];
	let lastMonth = -1;

	// Pad the first week so the earliest day lands on its correct weekday row.
	const leadingPad = mondayIndex(firstDay.date);
	for (let i = 0; i < leadingPad; i += 1) current.push(null);

	const flushWeek = () => {
		while (current.length < 7) current.push(null);
		const firstReal = current.find((d): d is ActivityHeatmapDay => d !== null);
		let monthLabel: string | null = null;
		if (firstReal) {
			const month = Number(firstReal.date.slice(5, 7)) - 1;
			if (month !== lastMonth) {
				monthLabel = MONTH_LABELS[month] ?? null;
				lastMonth = month;
			}
		}
		weeks.push({
			key: firstReal?.date ?? `pad-${weeks.length}`,
			days: current,
			monthLabel,
		});
		current = [];
	};

	for (const day of days) {
		current.push(day);
		if (current.length === 7) flushWeek();
	}
	if (current.length > 0) flushWeek();

	return weeks;
}

export function ActivityHeatmap({
	days,
	className,
	ariaLabel = "Карта активности",
}: ActivityHeatmapProps) {
	const max = days.reduce((acc, day) => Math.max(acc, day.count), 0);
	const weeks = buildWeeks(days);

	if (weeks.length === 0) {
		return (
			<div
				className={cn(
					"rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground",
					className,
				)}
			>
				Пока нет активности.
			</div>
		);
	}

	return (
		<div className={cn("w-full overflow-x-auto", className)}>
			<div className="flex gap-2" aria-label={ariaLabel} role="img">
				<div className="flex shrink-0 flex-col gap-[3px] pt-[18px] pr-1">
					{WEEKDAY_LABELS.map((label, index) => (
						<div
							key={`wd-${index}-${label}`}
							className="h-[11px] text-[9px] leading-[11px] text-muted-foreground"
						>
							{label}
						</div>
					))}
				</div>
				<div className="flex gap-[3px]">
					{weeks.map((week) => (
						<div key={week.key} className="flex flex-col gap-[3px]">
							<div className="h-[14px] text-[9px] leading-[14px] text-muted-foreground">
								{week.monthLabel ?? ""}
							</div>
							{week.days.map((day, dayIndex) => {
								if (!day) {
									return (
										<div
											key={`empty-${week.key}-${dayIndex}`}
											className="size-[11px]"
										/>
									);
								}
								const level = activityLevel(day.count, max);
								return (
									<div
										key={day.date}
										className={cn(
											"size-[11px] rounded-[2px]",
											LEVEL_CLASSES[level],
										)}
										title={`${day.date}: ${numberFormatter.format(day.count)}`}
									/>
								);
							})}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
