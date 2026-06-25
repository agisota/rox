/** One heatmap cell: a UTC `YYYY-MM-DD` day, its event count, and 0–4 level. */
export interface ActivityDatum {
	date: string;
	count: number;
	level: number;
}

/** Map a per-day event count to the calendar's 0–4 intensity level. */
export function levelForCount(count: number): number {
	if (count <= 0) return 0;
	if (count <= 2) return 1;
	if (count <= 5) return 2;
	if (count <= 10) return 3;
	return 4;
}

/**
 * Build a contiguous trailing window of `days` heatmap cells (oldest first),
 * counting timestamps per UTC calendar day. The window always spans the full
 * range so the calendar has stable bounds even when activity is sparse.
 *
 * Pure and platform-portable (no DOM, no React) so the same activity model can
 * back a web/mobile twin of the journal surface.
 */
export function buildActivityData(
	timestamps: Array<Date | string>,
	days: number,
	now: Date = new Date(),
): ActivityDatum[] {
	const counts = new Map<string, number>();
	for (const ts of timestamps) {
		const date = typeof ts === "string" ? new Date(ts) : ts;
		const key = date.toISOString().slice(0, 10);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	const out: ActivityDatum[] = [];
	for (let offset = days - 1; offset >= 0; offset--) {
		const d = new Date(now);
		d.setUTCDate(d.getUTCDate() - offset);
		const key = d.toISOString().slice(0, 10);
		const count = counts.get(key) ?? 0;
		out.push({ date: key, count, level: levelForCount(count) });
	}
	return out;
}
