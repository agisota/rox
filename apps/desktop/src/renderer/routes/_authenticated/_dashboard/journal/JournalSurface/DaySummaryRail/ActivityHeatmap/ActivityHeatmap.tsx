import type { SelectJournalEvent } from "@rox/db/schema";
import { cloneElement, useMemo } from "react";
import { ActivityCalendar } from "react-activity-calendar";
import { buildActivityData } from "./buildActivityData";

interface ActivityHeatmapProps {
	events: SelectJournalEvent[];
	/**
	 * Invoked with a `YYYY-MM-DD` day when the user clicks a heatmap block, so the
	 * surface can scroll the reflection lane to that day.
	 */
	onSelectDay: (day: string) => void;
	/** Number of trailing days to render (inclusive of today). */
	days?: number;
}

const WEEKDAY_LABELS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
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

/**
 * Activity heatmap over the trailing `days` window, keyed on the same UTC day
 * grouping the rest of the journal uses. Clicking a day scrolls the reflection
 * lane to that day via `onSelectDay`. The component itself is platform-portable
 * (React + MIT `react-activity-calendar`); only the scroll target is desktop DOM.
 */
export function ActivityHeatmap({
	events,
	onSelectDay,
	days = 119,
}: ActivityHeatmapProps) {
	const data = useMemo(
		() =>
			buildActivityData(
				events.map((e) => e.createdAt),
				days,
			),
		[events, days],
	);

	return (
		<ActivityCalendar
			data={data}
			blockSize={10}
			blockMargin={3}
			fontSize={11}
			showTotalCount={false}
			weekStart={1}
			labels={{ weekdays: WEEKDAY_LABELS, months: MONTH_LABELS }}
			theme={{
				light: ["hsl(45 10% 90%)", "hsl(38 92% 50%)"],
				dark: ["hsl(45 6% 22%)", "hsl(38 92% 55%)"],
			}}
			renderBlock={(block, activity) => {
				const interactive = activity.count > 0;
				return cloneElement(block, {
					role: "button",
					tabIndex: interactive ? 0 : -1,
					"aria-label": `${activity.date}: ${activity.count} событий`,
					style: {
						...block.props.style,
						cursor: interactive ? "pointer" : "default",
					},
					onClick: interactive ? () => onSelectDay(activity.date) : undefined,
					onKeyDown: interactive
						? (e: React.KeyboardEvent) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									onSelectDay(activity.date);
								}
							}
						: undefined,
				});
			}}
		/>
	);
}
