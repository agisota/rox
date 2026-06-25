import { getStroke } from "perfect-freehand";

/**
 * Platform-neutral freehand helpers. The pen tool captures pointer samples as
 * `[x, y, pressure]` tuples; these helpers smooth them with perfect-freehand
 * and serialise the result into an SVG path string that is stored on the
 * canvas node (`metadata.path`). Keeping the conversion here means web, mobile,
 * and desktop renderers share the exact same stroke geometry.
 */

/** A single pointer sample: `[x, y]` or `[x, y, pressure]`. */
export type FreehandPoint = [number, number] | [number, number, number];

export interface FreehandStrokeOptions {
	/** Base stroke width in px. */
	size?: number;
	/** Pressure thinning factor (-1..1). */
	thinning?: number;
	/** Stroke smoothing (0..1). */
	smoothing?: number;
	/** Point streamlining (0..1). */
	streamline?: number;
	/** Whether the stroke endpoints taper to a point. */
	taperStart?: boolean;
	taperEnd?: boolean;
}

export const DEFAULT_FREEHAND_OPTIONS: Required<FreehandStrokeOptions> = {
	size: 8,
	thinning: 0.6,
	smoothing: 0.5,
	streamline: 0.5,
	taperStart: true,
	taperEnd: true,
};

/** Bounding box of a list of stroke points. */
export interface FreehandBounds {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
	width: number;
	height: number;
}

export function getFreehandBounds(points: FreehandPoint[]): FreehandBounds {
	if (points.length === 0) {
		return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
	}
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	for (const [x, y] of points) {
		if (x < minX) minX = x;
		if (y < minY) minY = y;
		if (x > maxX) maxX = x;
		if (y > maxY) maxY = y;
	}
	return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Translate every point by `(-dx, -dy)`. Used to normalise an absolute-canvas
 * stroke into node-local coordinates before serialising the SVG path.
 */
export function translateFreehandPoints(
	points: FreehandPoint[],
	dx: number,
	dy: number,
): FreehandPoint[] {
	return points.map((point) => {
		const [x, y, pressure] = point;
		return pressure === undefined
			? ([x - dx, y - dy] as FreehandPoint)
			: ([x - dx, y - dy, pressure] as FreehandPoint);
	});
}

/**
 * Convert the perfect-freehand outline polygon into an SVG path `d` string.
 * Mirrors the canonical recipe from the perfect-freehand README
 * (`getSvgPathFromStroke`) using quadratic curves between midpoints.
 */
export function outlineToSvgPath(outline: number[][]): string {
	const first = outline[0];
	if (!first) return "";
	const d: (string | number)[] = ["M", first[0] ?? 0, first[1] ?? 0, "Q"];
	for (let index = 0; index < outline.length; index += 1) {
		const current = outline[index];
		const next = outline[(index + 1) % outline.length];
		if (!current || !next) continue;
		const x0 = current[0] ?? 0;
		const y0 = current[1] ?? 0;
		const x1 = next[0] ?? 0;
		const y1 = next[1] ?? 0;
		d.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
	}
	d.push("Z");
	return d.join(" ");
}

/**
 * Smooth a list of pointer samples and return the closed SVG path `d` string of
 * the stroke outline. Returns an empty string when there are no points.
 */
export function freehandPointsToSvgPath(
	points: FreehandPoint[],
	options: FreehandStrokeOptions = {},
): string {
	if (points.length === 0) return "";
	const merged = { ...DEFAULT_FREEHAND_OPTIONS, ...options };
	const outline = getStroke(points, {
		size: merged.size,
		thinning: merged.thinning,
		smoothing: merged.smoothing,
		streamline: merged.streamline,
		start: { taper: merged.taperStart },
		end: { taper: merged.taperEnd },
	});
	return outlineToSvgPath(outline);
}
