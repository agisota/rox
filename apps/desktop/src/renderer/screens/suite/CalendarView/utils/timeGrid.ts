/**
 * Pure geometry for the NEW Week/Day time-grid views (no web equivalent).
 *
 * The grid renders 24 hour-rows; events are absolutely positioned by
 * `top = minutesFromMidnight * PX_PER_MINUTE` and
 * `height = durationMinutes * PX_PER_MINUTE`. Concurrent (time-overlapping)
 * events within a single day column are packed into side-by-side lanes via a
 * simple greedy interval-packing pass (mirrors schedule-x / react-big-calendar's
 * lane algorithm). All math is UTC-based to match the half-open `[start,end)`
 * window the server expander emits and the UTC `Date` model `listOccurrences`
 * returns — consistent with monthGrid/datetimeLocal which also work in UTC.
 */

/** Vertical density of the time grid: pixels per minute. 1h = 48px. */
export const PX_PER_MINUTE = 0.8;

/** Total height of the 24h body, in px. */
export const DAY_BODY_HEIGHT = 24 * 60 * PX_PER_MINUTE;

/** Minimum rendered block height so a very short event stays clickable. */
export const MIN_BLOCK_HEIGHT = 18;

/** Snap step (minutes) for click-to-create in the time grid. */
export const SLOT_SNAP_MINUTES = 15;

/** The 24 hour labels (00:00 … 23:00) for the left time axis. */
export const HOUR_LABELS: string[] = Array.from(
	{ length: 24 },
	(_, h) => `${`${h}`.padStart(2, "0")}:00`,
);

export interface TimedBlock<T> {
	item: T;
	/** UTC start instant. */
	start: Date;
	/** UTC end instant. */
	end: Date;
}

export interface PositionedBlock<T> extends TimedBlock<T> {
	/** px offset from the top of the day body. */
	top: number;
	/** px height of the block (>= MIN_BLOCK_HEIGHT). */
	height: number;
	/** 0-based lane index within the day's overlap cluster. */
	lane: number;
	/** Number of lanes in this block's overlap cluster (column denominator). */
	laneCount: number;
}

/** UTC midnight of the day containing `date`. */
export function startOfUtcDay(date: Date): Date {
	const d = new Date(date);
	d.setUTCHours(0, 0, 0, 0);
	return d;
}

/** Add `delta` whole days to a UTC instant. */
export function addUtcDays(date: Date, delta: number): Date {
	const d = new Date(date);
	d.setUTCDate(d.getUTCDate() + delta);
	return d;
}

/** Monday-based start of the UTC week containing `date` (00:00). */
export function startOfUtcWeek(date: Date): Date {
	const d = startOfUtcDay(date);
	const mondayIndex = (d.getUTCDay() + 6) % 7;
	return addUtcDays(d, -mondayIndex);
}

/** Minutes from the given day's UTC midnight, clamped to [0, 1440]. */
export function minutesFromDayStart(instant: Date, dayStart: Date): number {
	const diff = (instant.getTime() - dayStart.getTime()) / 60000;
	if (diff < 0) return 0;
	if (diff > 1440) return 1440;
	return diff;
}

/**
 * Greedy lane packing for a single day's timed blocks. Blocks are sorted by
 * start (then by longer duration first) and each is placed in the first lane
 * whose latest end does not overlap; a cluster of mutually-overlapping blocks
 * shares the same `laneCount` so they render as equal-width columns.
 */
export function packDayLanes<T>(
	blocks: TimedBlock<T>[],
	dayStart: Date,
): PositionedBlock<T>[] {
	if (blocks.length === 0) return [];

	const sorted = [...blocks].sort((a, b) => {
		const byStart = a.start.getTime() - b.start.getTime();
		if (byStart !== 0) return byStart;
		// Longer first on a tie so the wider block claims lane 0.
		return b.end.getTime() - a.end.getTime();
	});

	// laneEnds[i] = end-time (ms) of the last block placed in lane i.
	const laneEnds: number[] = [];
	const placements = sorted.map((block) => {
		const startMs = block.start.getTime();
		let lane = laneEnds.findIndex((end) => end <= startMs);
		if (lane === -1) {
			lane = laneEnds.length;
			laneEnds.push(block.end.getTime());
		} else {
			laneEnds[lane] = block.end.getTime();
		}
		return { block, lane };
	});

	// Resolve laneCount per overlap cluster: walk in start order, tracking the
	// set of blocks still "open" (end > current start); the running max lane+1
	// across an open cluster is its column denominator.
	const positioned: PositionedBlock<T>[] = [];
	let clusterStartIdx = 0;
	let clusterMaxEnd = -Infinity;
	let clusterLaneCount = 0;

	const flush = (fromIdx: number, toIdx: number, laneCount: number) => {
		for (let i = fromIdx; i < toIdx; i++) {
			const placed = placements[i];
			if (!placed) continue;
			const { block, lane } = placed;
			const topMin = minutesFromDayStart(block.start, dayStart);
			const endMin = minutesFromDayStart(block.end, dayStart);
			const rawHeight = (endMin - topMin) * PX_PER_MINUTE;
			positioned.push({
				...block,
				top: topMin * PX_PER_MINUTE,
				height: Math.max(rawHeight, MIN_BLOCK_HEIGHT),
				lane,
				laneCount,
			});
		}
	};

	placements.forEach((placed, idx) => {
		const startMs = placed.block.start.getTime();
		if (startMs >= clusterMaxEnd) {
			// Previous cluster closed — emit it with its resolved lane count.
			if (idx > clusterStartIdx) {
				flush(clusterStartIdx, idx, clusterLaneCount);
			}
			clusterStartIdx = idx;
			clusterMaxEnd = placed.block.end.getTime();
			clusterLaneCount = placed.lane + 1;
		} else {
			clusterMaxEnd = Math.max(clusterMaxEnd, placed.block.end.getTime());
			clusterLaneCount = Math.max(clusterLaneCount, placed.lane + 1);
		}
	});
	flush(clusterStartIdx, placements.length, clusterLaneCount);

	return positioned;
}

/**
 * Snap a click position (px from the top of the day body) to a UTC instant on
 * `dayStart`, rounded to `SLOT_SNAP_MINUTES`.
 */
export function snapPxToInstant(offsetPx: number, dayStart: Date): Date {
	const minutes = Math.max(0, offsetPx) / PX_PER_MINUTE;
	const snapped = Math.round(minutes / SLOT_SNAP_MINUTES) * SLOT_SNAP_MINUTES;
	const clamped = Math.min(snapped, 24 * 60 - SLOT_SNAP_MINUTES);
	const instant = new Date(dayStart);
	instant.setUTCMinutes(instant.getUTCMinutes() + clamped);
	return instant;
}
