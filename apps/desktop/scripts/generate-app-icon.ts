/**
 * Generate the macOS / cross-platform application icon as RGBA artwork.
 *
 * The previous `icon.png` / `icon.icns` shipped an OPAQUE black square (color
 * type RGB, no alpha), so the macOS dock rendered hard corners instead of the
 * rounded app-icon shape. This script renders a premium near-black Apple
 * continuous-curvature squircle (superellipse, NOT a plain rounded-rect) with
 * TRANSPARENT corners, composites the existing Rox "girl" white line-art mark
 * centered and slightly larger, and emits the full macOS size ladder as RGBA
 * PNGs packed into an `.icns` via `iconutil`.
 *
 * Every emitted PNG is verified to carry an alpha channel (sharp
 * `metadata.hasAlpha`) before it is written; the build throws otherwise.
 *
 * Run: `bun run scripts/generate-app-icon.ts`
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const ROOT = resolve(import.meta.dirname, "..");
const ICONS_DIR = resolve(ROOT, "src/resources/build/icons");
const VARIANTS_DIR = resolve(import.meta.dirname, ".icon-variants");

/**
 * Immutable source of the white "girl" line-art (white art on opaque black).
 * This file is the extraction input and is NEVER written by this script — the
 * generated `icon.png` is an OUTPUT, so reading the mark from a dedicated source
 * keeps regeneration idempotent across repeated builds.
 */
const SOURCE_MARK = resolve(ICONS_DIR, "source/girl-mark.png");

/** Master render resolution. The full size ladder is downscaled from this. */
const MASTER = 1024;

/**
 * macOS Big Sur app-icon grid: the rounded body occupies ~824/1024 of the
 * canvas, leaving a transparent margin so the dock sizes the icon like every
 * other modern macOS app instead of bleeding edge-to-edge.
 */
const BODY = 824;
const MARGIN = (MASTER - BODY) / 2;

/**
 * Canonical macOS `.icns` pixel ladder (1024/512/256/128/64/32). `packIcns`
 * emits one RGBA PNG per Apple size slot covering exactly these resolutions.
 */
const ICON_LADDER = [1024, 512, 256, 128, 64, 32] as const;

/** Linux icon dir ladder shipped as `NNNxNNN.png` (electron-builder linux). */
const LINUX_LADDER = [1024, 512, 256, 128] as const;

type Rgb = { r: number; g: number; b: number };

interface Variant {
	id: string;
	label: string;
	/** Squircle fill: solid color, vertical gradient, or radial glow. */
	fill:
		| { kind: "solid"; color: Rgb }
		| { kind: "vertical"; top: Rgb; bottom: Rgb }
		| { kind: "radial"; inner: Rgb; outer: Rgb };
	/** Girl mark scale relative to the squircle body width. */
	markScale: number;
	/** Optional hue rotation (deg) applied to the whole tile (dev/canary tint). */
	hueRotate?: number;
	/** Optional accent badge color drawn bottom-right (dev/canary marker). */
	badge?: Rgb;
}

/** Near-black brand surface. Kept dark + premium, never pure #000. */
const INK_TOP: Rgb = { r: 26, g: 27, b: 30 };
const INK_BOTTOM: Rgb = { r: 9, g: 9, b: 11 };
const INK_FLAT: Rgb = { r: 14, g: 15, b: 18 };
const GLOW_INNER: Rgb = { r: 34, g: 36, b: 41 };
const GLOW_OUTER: Rgb = { r: 8, g: 8, b: 10 };

const VARIANTS: Variant[] = [
	{
		id: "v1",
		label: "subtle vertical gradient + bigger girl",
		fill: { kind: "vertical", top: INK_TOP, bottom: INK_BOTTOM },
		markScale: 0.72,
	},
	{
		id: "v2",
		label: "flat premium black + biggest girl",
		fill: { kind: "solid", color: INK_FLAT },
		markScale: 0.78,
	},
	{
		id: "v3",
		label: "slight radial glow",
		fill: { kind: "radial", inner: GLOW_INNER, outer: GLOW_OUTER },
		markScale: 0.72,
	},
];

/** The committed default. v1 reads cleanest at dock size: depth + a larger mark. */
const DEFAULT_VARIANT_ID = "v1";

const rgb = ({ r, g, b }: Rgb) => `rgb(${r},${g},${b})`;

/**
 * Apple continuous-curvature squircle path (superellipse, ~n=5) expressed as
 * cubic Béziers. Unlike a plain rounded-rect, the curvature flows smoothly from
 * the straight edge into the corner with no second-derivative discontinuity —
 * this is the "squircle" look macOS uses for app icons.
 */
function squirclePath(size: number, originX: number, originY: number): string {
	const cx = originX + size / 2;
	const cy = originY + size / 2;
	const a = size / 2;
	// Apple superellipse exponent. Higher = squarer with tighter corner sweep.
	const n = 5;
	const steps = 720;
	const pts: Array<[number, number]> = [];
	for (let i = 0; i <= steps; i++) {
		const t = (i / steps) * 2 * Math.PI;
		const ct = Math.cos(t);
		const st = Math.sin(t);
		// Signed superellipse: |x/a|^n + |y/a|^n = 1
		const x = cx + Math.sign(ct) * a * Math.abs(ct) ** (2 / n);
		const y = cy + Math.sign(st) * a * Math.abs(st) ** (2 / n);
		pts.push([x, y]);
	}
	let d = `M ${pts[0][0].toFixed(3)} ${pts[0][1].toFixed(3)}`;
	for (let i = 1; i < pts.length; i++) {
		d += ` L ${pts[i][0].toFixed(3)} ${pts[i][1].toFixed(3)}`;
	}
	return `${d} Z`;
}

/** Build the squircle tile (fill + optional gradient/glow) as an RGBA PNG buffer. */
async function renderSquircle(variant: Variant): Promise<Buffer> {
	const path = squirclePath(BODY, MARGIN, MARGIN);
	let defs = "";
	let fillRef = "";
	if (variant.fill.kind === "solid") {
		fillRef = rgb(variant.fill.color);
	} else if (variant.fill.kind === "vertical") {
		defs = `
			<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="${rgb(variant.fill.top)}" />
				<stop offset="1" stop-color="${rgb(variant.fill.bottom)}" />
			</linearGradient>`;
		fillRef = "url(#g)";
	} else {
		defs = `
			<radialGradient id="g" cx="0.5" cy="0.42" r="0.72">
				<stop offset="0" stop-color="${rgb(variant.fill.inner)}" />
				<stop offset="1" stop-color="${rgb(variant.fill.outer)}" />
			</radialGradient>`;
		fillRef = "url(#g)";
	}

	// A faint top-edge highlight sells the premium glass-on-black depth without
	// reading as a separate shape at small sizes.
	const sheen = `
		<linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="rgba(255,255,255,0.06)" />
			<stop offset="0.18" stop-color="rgba(255,255,255,0)" />
		</linearGradient>`;

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${MASTER}" height="${MASTER}" viewBox="0 0 ${MASTER} ${MASTER}">
		<defs>${defs}${sheen}</defs>
		<path d="${path}" fill="${fillRef}" />
		<path d="${path}" fill="url(#sheen)" />
	</svg>`;

	return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * Extract the white "girl" line-art from the immutable source (white art on
 * opaque black). The art is strongly bimodal — pure-black background AND a
 * black negative-space face vs. bright white linework — so the white band is
 * the only drawn signal. We threshold luminance into a soft alpha mask of the
 * white art, recolor it pure white, and trim to the art bounding box so it can
 * be scaled up cleanly. The black face is intentionally negative space: on the
 * dark squircle it reads exactly as in the original.
 */
async function extractGirlMark(): Promise<Buffer> {
	if (!existsSync(SOURCE_MARK)) {
		throw new Error(`Source mark not found: ${SOURCE_MARK}`);
	}
	// Greyscale → contrast stretch → threshold isolates the white linework as a
	// single-channel mask. A light blur on the mask edge restores antialiasing
	// the hard threshold removed, so the upscaled mark keeps crisp-but-smooth
	// edges. Emitted RAW (1 channel) so it can be joined as an alpha plane.
	const mask = await sharp(SOURCE_MARK)
		.removeAlpha()
		.resize(MASTER, MASTER, { fit: "fill" })
		.greyscale()
		.linear(1.4, -20) // lift the white art, keep the dark field at zero
		.threshold(110)
		.blur(0.6)
		.raw()
		.toBuffer();

	// Build a pure-white RGB field and use the mask as its alpha channel. The
	// raw-buffer form (with explicit dims) is the reliable way to drive alpha
	// from a greyscale plane — joining an encoded PNG yields an opaque result.
	const white = await sharp({
		create: {
			width: MASTER,
			height: MASTER,
			channels: 3,
			background: { r: 255, g: 255, b: 255 },
		},
	})
		.joinChannel(mask, {
			raw: { width: MASTER, height: MASTER, channels: 1 },
		})
		.png()
		.toBuffer();

	// Trim the transparent border so the mark fills its frame for scaling.
	return sharp(white).trim({ threshold: 1 }).png().toBuffer();
}

/** Composite the squircle tile + scaled girl mark, applying any dev/canary tint. */
async function composeTile(variant: Variant, mark: Buffer): Promise<Buffer> {
	// Tint (dev/canary hue shift) is applied to the squircle BASE only, so the
	// white mark stays white and the channel badge keeps its true color.
	let squircle = await renderSquircle(variant);
	if (variant.hueRotate) {
		squircle = await sharp(squircle)
			.modulate({ hue: variant.hueRotate })
			.png()
			.toBuffer();
	}

	const markSize = Math.round(BODY * variant.markScale);
	const resizedMark = await sharp(mark)
		.resize(markSize, markSize, { fit: "contain", background: TRANSPARENT })
		.png()
		.toBuffer();
	const markOffset = Math.round((MASTER - markSize) / 2);

	const layers: sharp.OverlayOptions[] = [
		{ input: resizedMark, top: markOffset, left: markOffset },
	];

	if (variant.badge) {
		const badge = await renderBadge(variant.badge);
		const badgeSize = Math.round(BODY * 0.22);
		const pad = MARGIN + Math.round(BODY * 0.06);
		layers.push({
			input: badge,
			top: MASTER - pad - badgeSize,
			left: MASTER - pad - badgeSize,
		});
	}

	return sharp(squircle).composite(layers).png().toBuffer();
}

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 } as const;

/** Small filled circle used as the dev/canary channel badge. */
function renderBadge(color: Rgb): Promise<Buffer> {
	const size = Math.round(BODY * 0.22);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
		<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 4}" fill="${rgb(color)}" stroke="rgba(0,0,0,0.35)" stroke-width="4" />
	</svg>`;
	return sharp(Buffer.from(svg)).png().toBuffer();
}

/** Assert an RGBA buffer truly has an alpha channel, then write it to disk. */
async function writeRgba(buf: Buffer, dest: string): Promise<void> {
	const meta = await sharp(buf).metadata();
	if (!meta.hasAlpha || (meta.channels ?? 0) < 4) {
		throw new Error(
			`Refusing to write ${dest}: not RGBA (hasAlpha=${meta.hasAlpha}, channels=${meta.channels})`,
		);
	}
	writeFileSync(dest, buf);
}

/** Emit the full size ladder into a temp `.iconset` and pack it via `iconutil`. */
async function packIcns(tile: Buffer, icnsPath: string): Promise<void> {
	const iconset = `${icnsPath.replace(/\.icns$/, "")}.iconset`;
	rmSync(iconset, { recursive: true, force: true });
	mkdirSync(iconset, { recursive: true });

	// iconutil expects the canonical Apple naming (icon_NxN[@2x]).
	const ladder: Array<{ px: number; name: string }> = [
		{ px: 1024, name: "icon_512x512@2x.png" },
		{ px: 512, name: "icon_512x512.png" },
		{ px: 512, name: "icon_256x256@2x.png" },
		{ px: 256, name: "icon_256x256.png" },
		{ px: 256, name: "icon_128x128@2x.png" },
		{ px: 128, name: "icon_128x128.png" },
		{ px: 64, name: "icon_32x32@2x.png" },
		{ px: 32, name: "icon_32x32.png" },
		{ px: 32, name: "icon_16x16@2x.png" },
		{ px: 16, name: "icon_16x16.png" },
	];

	// Guard: every canonical ladder resolution must be represented in the iconset.
	const emittedPx = new Set(ladder.map((entry) => entry.px));
	for (const px of ICON_LADDER) {
		if (!emittedPx.has(px)) {
			throw new Error(`Iconset is missing required ${px}px slot`);
		}
	}

	for (const { px, name } of ladder) {
		const png = await sharp(tile)
			.resize(px, px, { fit: "contain", background: TRANSPARENT })
			.png()
			.toBuffer();
		await writeRgba(png, resolve(iconset, name));
	}

	execFileSync("iconutil", ["-c", "icns", iconset, "-o", icnsPath], {
		stdio: "inherit",
	});
	rmSync(iconset, { recursive: true, force: true });
}

/**
 * Emit the canonical PNGs the rest of the build consumes:
 *   - icon.png (1024 RGBA master)
 *   - NNNxNNN.png linux ladder (electron-builder linux icon dir)
 */
async function emitPngLadder(tile: Buffer, prefix: string): Promise<void> {
	await writeRgba(
		await sharp(tile).resize(MASTER, MASTER).png().toBuffer(),
		resolve(ICONS_DIR, `${prefix}.png`),
	);
	// Linux ladder is only generated for the primary icon (no -dev/-canary suffix).
	if (prefix !== "icon") return;
	for (const px of LINUX_LADDER) {
		const png = await sharp(tile)
			.resize(px, px, { fit: "contain", background: TRANSPARENT })
			.png()
			.toBuffer();
		await writeRgba(png, resolve(ICONS_DIR, `${px}x${px}.png`));
	}
}

/**
 * Confirm the PNGs embedded inside an `.icns` are RGBA (alpha-channel proof):
 * unpack the `.icns` back to a temporary iconset and assert the largest
 * extracted PNG still carries an alpha channel. macOS `iconutil` has no list
 * flag, so a round-trip is the reliable check.
 */
async function verifyIcnsAlpha(icnsPath: string): Promise<void> {
	const probeDir = `${icnsPath.replace(/\.icns$/, "")}.verify.iconset`;
	rmSync(probeDir, { recursive: true, force: true });
	execFileSync("iconutil", ["-c", "iconset", icnsPath, "-o", probeDir], {
		stdio: "inherit",
	});
	const largest = resolve(probeDir, "icon_512x512@2x.png");
	const meta = await sharp(largest).metadata();
	rmSync(probeDir, { recursive: true, force: true });
	if (!meta.hasAlpha || (meta.channels ?? 0) < 4) {
		throw new Error(
			`.icns embedded PNG is not RGBA: ${icnsPath} (hasAlpha=${meta.hasAlpha}, channels=${meta.channels})`,
		);
	}
}

async function main(): Promise<void> {
	if (!existsSync(ICONS_DIR)) {
		throw new Error(`Icons dir missing: ${ICONS_DIR}`);
	}
	mkdirSync(VARIANTS_DIR, { recursive: true });

	const mark = await extractGirlMark();

	// 1) Render every variant preview so they can be compared visually.
	const tiles = new Map<string, Buffer>();
	for (const variant of VARIANTS) {
		const tile = await composeTile(variant, mark);
		tiles.set(variant.id, tile);
		await writeRgba(tile, resolve(VARIANTS_DIR, `${variant.id}.png`));
		console.log(`variant ${variant.id} (${variant.label}) → preview written`);
	}

	// 2) Pick the committed default variant + its rendered tile.
	const defaultVariant = VARIANTS.find((v) => v.id === DEFAULT_VARIANT_ID);
	const chosen = tiles.get(DEFAULT_VARIANT_ID);
	if (!defaultVariant || !chosen) {
		throw new Error(`Default variant ${DEFAULT_VARIANT_ID} missing`);
	}
	console.log(`chosen default variant: ${DEFAULT_VARIANT_ID}`);

	// 3) Emit the primary icon family (PNG ladder + .icns).
	await emitPngLadder(chosen, "icon");
	await packIcns(chosen, resolve(ICONS_DIR, "icon.icns"));
	await verifyIcnsAlpha(resolve(ICONS_DIR, "icon.icns"));

	// 4) Dev / canary reuse the master with a small hue + badge tweak.
	const channels: Array<{ prefix: string; variant: Variant }> = [
		{
			prefix: "icon-dev",
			variant: {
				...defaultVariant,
				id: "dev",
				hueRotate: 200,
				badge: { r: 96, g: 165, b: 250 }, // calm blue = dev
			},
		},
		{
			prefix: "icon-canary",
			variant: {
				...defaultVariant,
				id: "canary",
				hueRotate: 45,
				badge: { r: 250, g: 204, b: 21 }, // amber = canary
			},
		},
	];

	for (const { prefix, variant } of channels) {
		if (!existsSync(resolve(ICONS_DIR, `${prefix}.png`))) continue;
		const tile = await composeTile(variant, mark);
		await emitPngLadder(tile, prefix);
		await packIcns(tile, resolve(ICONS_DIR, `${prefix}.icns`));
		await verifyIcnsAlpha(resolve(ICONS_DIR, `${prefix}.icns`));
		console.log(`channel ${prefix} → png + icns written (RGBA)`);
	}

	console.log("app icon generation complete (all PNGs RGBA, .icns packed)");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
