/**
 * Collision-free radial scatter for the intro feature-tag cloud.
 *
 * The previous layout used a raw golden-angle scatter that let tag bounding
 * boxes intersect, so labels piled up into an unreadable mess. This packer
 * instead places tags one-by-one on a golden-angle spiral and rejects any
 * candidate whose (estimated) bounding box intersects an already-placed tag —
 * with a small jitter retry — so the final cloud reads as an intentional,
 * readable scatter. It is responsive: the caller passes the live container box
 * (px) plus a cap, and the packer drops tags it cannot fit without overlap.
 */

export interface FeatureCloudInput {
	/** Tag text, used to estimate each label's footprint. */
	text: string;
	/** Original index — preserved so colour/keys stay stable. */
	index: number;
}

export interface FeatureCloudPlacement {
	index: number;
	/** Centre X as a percentage of the container width. */
	xPct: number;
	/** Centre Y as a percentage of the container height. */
	yPct: number;
	rotationDeg: number;
	scale: number;
}

export interface FeatureCloudLayoutOptions {
	/** Container width in px. */
	width: number;
	/** Container height in px. */
	height: number;
	/** Approx font size in px used to estimate label footprints. */
	fontPx: number;
	/** Hard cap on how many tags to place (responsive). */
	maxTags: number;
	/** Extra breathing room (px) added around every label box. */
	gapPx: number;
}

interface PlacedBox {
	cx: number;
	cy: number;
	halfW: number;
	halfH: number;
}

/** Deterministic pseudo-random in [0,1) from an integer seed (no Math.random). */
function seeded(seed: number): number {
	const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
	return x - Math.floor(x);
}

function boxesOverlap(a: PlacedBox, b: PlacedBox): boolean {
	return (
		Math.abs(a.cx - b.cx) < a.halfW + b.halfW &&
		Math.abs(a.cy - b.cy) < a.halfH + b.halfH
	);
}

/**
 * Estimate a label's rendered footprint in px. SF Pro at the cloud's weight is
 * roughly 0.52em per character wide; height is ~1.25em. We keep the estimate a
 * touch generous so real text never clips its neighbour.
 */
function estimateLabelBox(
	text: string,
	fontPx: number,
	gapPx: number,
): { halfW: number; halfH: number } {
	const widthPx = text.length * fontPx * 0.54 + fontPx * 0.8;
	const heightPx = fontPx * 1.35;
	return {
		halfW: (widthPx + gapPx) / 2,
		halfH: (heightPx + gapPx) / 2,
	};
}

const GOLDEN_ANGLE = 137.50776405 * (Math.PI / 180);

/**
 * Pack tags on a golden-angle spiral, rejecting overlaps. Returns placements in
 * percentages so the caller can position with `top`/`left`. Tags that cannot be
 * placed without collision (after retries) are dropped.
 */
export function layoutFeatureCloud(
	tags: ReadonlyArray<FeatureCloudInput>,
	options: FeatureCloudLayoutOptions,
): FeatureCloudPlacement[] {
	const { width, height, fontPx, maxTags, gapPx } = options;
	if (width <= 0 || height <= 0) return [];

	const placements: FeatureCloudPlacement[] = [];
	const placed: PlacedBox[] = [];

	const centreX = width / 2;
	const centreY = height / 2;
	// Spiral radius growth: fill the box edge-to-edge over the spiral.
	const maxRadius = Math.min(width, height) * 0.62;
	const candidates = Math.min(tags.length, Math.max(0, maxTags));

	let spiralStep = 0;
	for (let i = 0; i < candidates; i++) {
		const tag = tags[i];
		if (!tag) continue;
		const { halfW, halfH } = estimateLabelBox(tag.text, fontPx, gapPx);

		let placedThisTag = false;
		// Try a sequence of spiral positions until one is collision-free.
		for (let attempt = 0; attempt < 240 && !placedThisTag; attempt++) {
			spiralStep += 1;
			const t = spiralStep;
			const angle = t * GOLDEN_ANGLE;
			// sqrt growth → even areal density across the box.
			const radius = Math.sqrt(t / 240) * maxRadius;
			const jitter = (seeded(t) - 0.5) * fontPx * 0.6;
			// Squash vertically a touch so the cloud reads wider than tall.
			const cx = centreX + Math.cos(angle) * radius + jitter;
			const cy =
				centreY +
				Math.sin(angle) * radius * 0.82 +
				(seeded(t * 3) - 0.5) * fontPx;

			// Keep the whole box inside the container.
			if (
				cx - halfW < 0 ||
				cx + halfW > width ||
				cy - halfH < 0 ||
				cy + halfH > height
			) {
				continue;
			}

			const candidate: PlacedBox = { cx, cy, halfW, halfH };
			const collides = placed.some((box) => boxesOverlap(candidate, box));
			if (collides) continue;

			placed.push(candidate);
			const rotation = (seeded(tag.index * 7 + 1) - 0.5) * 12;
			const scale = 0.92 + seeded(tag.index * 11 + 3) * 0.22;
			placements.push({
				index: tag.index,
				xPct: (cx / width) * 100,
				yPct: (cy / height) * 100,
				rotationDeg: rotation,
				scale,
			});
			placedThisTag = true;
		}
	}

	return placements;
}
