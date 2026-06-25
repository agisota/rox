/**
 * Pure keyboard-navigation math for the calendar grids (roving focus + arrow
 * keys). Platform-agnostic — no DOM, no React — so it is unit-testable and the
 * web/mobile surfaces can reuse the same model. The view layer owns focus
 * (calling `.focus()` on the cell ref for the returned index); this module only
 * decides which flat cell index a key press moves to.
 *
 * Grid model: a flat `count`-length list laid out row-major in `columns`
 * columns (e.g. the 42-cell, 7-wide month grid, or the N day columns of the
 * week/day time grid as a single 1-row strip). Arrow keys move within the
 * rendered grid and clamp at the edges; Home/End jump to the row ends and
 * PageUp/PageDown jump a full column (week) up/down.
 */

/** Keys this module understands; everything else returns `null` (no move). */
export type GridNavKey =
	| "ArrowUp"
	| "ArrowDown"
	| "ArrowLeft"
	| "ArrowRight"
	| "Home"
	| "End"
	| "PageUp"
	| "PageDown";

export interface GridNavParams {
	/** Currently focused flat index (0-based). */
	current: number;
	/** Total number of cells. */
	count: number;
	/** Number of columns in the row-major layout (>= 1). */
	columns: number;
}

const NAV_KEYS = new Set<string>([
	"ArrowUp",
	"ArrowDown",
	"ArrowLeft",
	"ArrowRight",
	"Home",
	"End",
	"PageUp",
	"PageDown",
]);

/** Whether `key` is one this module navigates with (so the view can preventDefault). */
export function isGridNavKey(key: string): key is GridNavKey {
	return NAV_KEYS.has(key);
}

const clamp = (value: number, min: number, max: number): number =>
	Math.min(Math.max(value, min), max);

/**
 * Resolve the next focus index for a key press, or `null` when the key is not a
 * navigation key. The result is always clamped to `[0, count - 1]`; moves that
 * would leave the grid stay put (returning the clamped current index), which is
 * the expected roving-grid behavior at the edges.
 */
export function nextGridIndex(
	key: string,
	{ current, count, columns }: GridNavParams,
): number | null {
	if (count <= 0 || columns <= 0) return null;
	if (!isGridNavKey(key)) return null;

	const last = count - 1;
	const cur = clamp(current, 0, last);
	const row = Math.floor(cur / columns);
	const col = cur % columns;

	switch (key) {
		case "ArrowLeft": {
			return col === 0 ? cur : cur - 1;
		}
		case "ArrowRight": {
			return col === columns - 1 ? cur : Math.min(cur + 1, last);
		}
		case "ArrowUp": {
			const target = cur - columns;
			return target < 0 ? cur : target;
		}
		case "ArrowDown": {
			const target = cur + columns;
			return target > last ? cur : target;
		}
		case "Home": {
			// Start of the current row.
			return row * columns;
		}
		case "End": {
			// End of the current row (clamped to the last cell).
			return Math.min(row * columns + (columns - 1), last);
		}
		case "PageUp": {
			// Same column, top row.
			return col;
		}
		case "PageDown": {
			// Same column, bottom-most row that still has this column.
			const rows = Math.ceil(count / columns);
			let target = (rows - 1) * columns + col;
			if (target > last) target -= columns;
			return clamp(target, 0, last);
		}
		default:
			return cur;
	}
}
