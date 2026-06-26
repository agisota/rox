#!/usr/bin/env bun
/**
 * generate-brand-icons.ts
 *
 * Regenerates every brand icon across the Rox monorepo from the single
 * canonical Rox "girl" brand mark, so no app ships the stale generic "{ }"
 * bracket icon anymore.
 *
 * Canonical source (white line-art girl on a near-black 1024x1024 squircle):
 *   apps/desktop/src/resources/build/icons/source/girl-mark.png
 *
 * Visual target to match for favicons (girl, white line-art, ~77% of canvas
 * height, centered on a solid near-black square with a small padding margin):
 *   apps/web/public/favicon-192.png
 *
 * The script crops the girl out of the source squircle using its measured
 * bounding box, then recomposites it at a consistent scale/margin onto a fresh
 * background per output kind:
 *   - "solid":       girl centered on an opaque near-black (#0a0a0a) square
 *                    (favicons, apple-touch, icon.png, Expo icon/web favicon)
 *   - "transparent": girl centered on a transparent square (Expo splash, which
 *                    Expo composites over its own backgroundColor)
 *   - "adaptive":    girl centered (smaller, inside the Android safe zone) on a
 *                    transparent square (Android adaptive foreground)
 *
 * Multi-resolution .ico files (16/32/48) are built with png-to-ico.
 *
 * Stack: Bun + sharp@0.34.5 + png-to-ico (both devDeps at the workspace root).
 * Run:  bun scripts/generate-brand-icons.ts
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pngToIco from "png-to-ico";
import sharp from "sharp";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(import.meta.dir, "..");

const SOURCE = path.join(
	REPO_ROOT,
	"apps/desktop/src/resources/build/icons/source/girl-mark.png",
);

/** Near-black premium background, matching apps/web/public/favicon-192.png. */
const BG = { r: 10, g: 10, b: 10, alpha: 1 } as const;

/**
 * Girl bounding box inside the 1024x1024 source squircle, measured from the
 * source: white (line-art) pixels span x[322..701], y[221..801].
 * That is 380w x 581h, horizontally centered on the 1024 canvas.
 */
const GIRL_BOX = { left: 322, top: 221, width: 380, height: 581 } as const;

/**
 * Fraction of the output canvas height the girl should occupy, matching the
 * reference favicon-192 (girl height 148px / 192px canvas = 0.771).
 */
const GIRL_HEIGHT_FRACTION = 0.771;

/**
 * For Android adaptive foregrounds the art must stay inside the safe zone
 * (the outer ~25% can be masked away on any device). Keep the girl smaller.
 */
const ADAPTIVE_HEIGHT_FRACTION = 0.52;

type BgKind = "solid" | "transparent" | "adaptive";

interface PngTarget {
	/** Repo-relative output path. */
	out: string;
	/** Square output edge length in px. */
	size: number;
	/** Background treatment. */
	bg: BgKind;
	/** Whether the written PNG keeps an alpha channel. */
	alpha: boolean;
}

interface IcoTarget {
	/** Repo-relative output path (.ico). */
	out: string;
	/** Resolutions packed into the .ico. */
	sizes: number[];
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

const PNG_TARGETS: PngTarget[] = [
	// --- apps/web ---
	{
		out: "apps/web/public/favicon-192.png",
		size: 192,
		bg: "solid",
		alpha: true,
	},
	{
		out: "apps/web/public/apple-touch-icon.png",
		size: 180,
		bg: "solid",
		alpha: false,
	},

	// --- apps/admin (stale "{ }") ---
	{
		out: "apps/admin/public/favicon-192.png",
		size: 192,
		bg: "solid",
		alpha: true,
	},
	{ out: "apps/admin/public/icon.png", size: 1024, bg: "solid", alpha: true },

	// --- apps/docs (stale "{ }") ---
	{
		out: "apps/docs/public/favicon-192.png",
		size: 192,
		bg: "solid",
		alpha: true,
	},
	// apple-touch-icon.png and logo.png are byte-identical 240x240 in docs.
	{
		out: "apps/docs/public/apple-touch-icon.png",
		size: 240,
		bg: "solid",
		alpha: true,
	},
	{ out: "apps/docs/public/logo.png", size: 240, bg: "solid", alpha: true },

	// --- apps/marketing ---
	{
		out: "apps/marketing/public/favicon-192.png",
		size: 192,
		bg: "solid",
		alpha: true,
	},
	{
		out: "apps/marketing/public/apple-touch-icon.png",
		size: 180,
		bg: "solid",
		alpha: false,
	},

	// --- apps/mobile (Expo) ---
	// iOS app icon: must be fully opaque (no alpha).
	{ out: "apps/mobile/assets/icon.png", size: 1024, bg: "solid", alpha: false },
	// Splash foreground: transparent so Expo's splash backgroundColor (#09090b)
	// shows through with resizeMode "contain".
	{
		out: "apps/mobile/assets/splash-icon.png",
		size: 1024,
		bg: "transparent",
		alpha: true,
	},
	// Android adaptive foreground: transparent, girl kept inside safe zone.
	{
		out: "apps/mobile/assets/adaptive-icon.png",
		size: 1024,
		bg: "adaptive",
		alpha: true,
	},
	// Web favicon for the Expo web target.
	{ out: "apps/mobile/assets/favicon.png", size: 48, bg: "solid", alpha: true },
];

const ICO_TARGETS: IcoTarget[] = [
	// --- apps/web ---
	{ out: "apps/web/public/favicon.ico", sizes: [16, 32, 48] },
	{ out: "apps/web/src/app/favicon.ico", sizes: [16, 32, 48] },

	// --- apps/admin (stale "{ }") ---
	{ out: "apps/admin/src/app/favicon.ico", sizes: [16, 32, 48] },

	// --- apps/docs (stale "{ }") ---
	{ out: "apps/docs/src/app/favicon.ico", sizes: [16, 32, 48] },

	// --- apps/marketing ---
	{ out: "apps/marketing/public/favicon.ico", sizes: [16, 32, 48] },
	{ out: "apps/marketing/src/app/favicon.ico", sizes: [16, 32, 48] },

	// --- apps/api (stale "{ }") ---
	{ out: "apps/api/src/app/favicon.ico", sizes: [16, 32, 48] },
];

// ---------------------------------------------------------------------------
// Core rendering
// ---------------------------------------------------------------------------

/** Cropped girl line-art (RGBA), cached across all renders. */
let girlBufferPromise: Promise<Buffer> | null = null;

function getGirl(): Promise<Buffer> {
	if (!girlBufferPromise) {
		girlBufferPromise = sharp(SOURCE)
			.extract(GIRL_BOX)
			.ensureAlpha()
			.png()
			.toBuffer();
	}
	return girlBufferPromise;
}

/**
 * Render a single square brand icon PNG buffer.
 *
 * The girl is scaled so its height is a fixed fraction of the canvas, then
 * centered on the requested background. Output dimensions are asserted to be
 * exactly `size x size` (and the alpha channel matches `alpha`) before return.
 */
async function renderPng(
	size: number,
	bg: BgKind,
	alpha: boolean,
): Promise<Buffer> {
	const heightFraction =
		bg === "adaptive" ? ADAPTIVE_HEIGHT_FRACTION : GIRL_HEIGHT_FRACTION;
	const targetGirlHeight = Math.round(size * heightFraction);

	// Preserve the girl's native aspect ratio; scale by height.
	const scaledGirl = await sharp(await getGirl())
		.resize({
			height: targetGirlHeight,
			fit: "contain",
			background: { r: 0, g: 0, b: 0, alpha: 0 },
		})
		.png()
		.toBuffer();

	const background = bg === "solid" ? BG : { r: 0, g: 0, b: 0, alpha: 0 };

	let canvas = sharp({
		create: {
			width: size,
			height: size,
			channels: 4,
			background,
		},
	}).composite([{ input: scaledGirl, gravity: "centre" }]);

	// For opaque targets, flatten onto the brand background AND drop the alpha
	// channel so the encoded PNG is true RGB (sharp keeps alpha after flatten
	// otherwise). For alpha targets, keep RGBA.
	canvas = alpha
		? canvas.png()
		: canvas.flatten({ background: BG }).removeAlpha().png();

	const buffer = await canvas.toBuffer();

	// --- Assert output dimensions + channels before the caller writes it. ---
	const meta = await sharp(buffer).metadata();
	if (meta.width !== size || meta.height !== size) {
		throw new Error(
			`Dimension assertion failed: expected ${size}x${size}, got ${meta.width}x${meta.height}`,
		);
	}
	const gotAlpha = meta.channels === 4 || meta.hasAlpha === true;
	if (gotAlpha !== alpha) {
		throw new Error(
			`Alpha assertion failed for ${size}x${size}: expected alpha=${alpha}, got channels=${meta.channels} hasAlpha=${meta.hasAlpha}`,
		);
	}
	return buffer;
}

async function writePng(target: PngTarget): Promise<void> {
	const abs = path.join(REPO_ROOT, target.out);
	const buffer = await renderPng(target.size, target.bg, target.alpha);
	await writeFile(abs, buffer);
	const meta = await sharp(abs).metadata();
	console.log(
		`  PNG  ${target.out.padEnd(44)} ${meta.width}x${meta.height} ` +
			`ch=${meta.channels} alpha=${meta.hasAlpha ? "yes" : "no"} (${buffer.length} B)`,
	);
}

/** Parse the resolutions packed into an .ico buffer, ascending (0 -> 256). */
function readIcoSizes(buf: Buffer): number[] {
	const count = buf.readUInt16LE(4);
	const sizes: number[] = [];
	for (let i = 0; i < count; i++) {
		const width = buf.readUInt8(6 + i * 16);
		sizes.push(width === 0 ? 256 : width);
	}
	return sizes.sort((a, b) => a - b);
}

async function writeIco(target: IcoTarget, scratchDir: string): Promise<void> {
	const abs = path.join(REPO_ROOT, target.out);

	// Render one opaque solid PNG per requested resolution, assert each, then
	// pack them into a single multi-resolution .ico via png-to-ico.
	const pngPaths: string[] = [];
	for (const size of target.sizes) {
		const buffer = await renderPng(size, "solid", true);
		const tmpPng = path.join(
			scratchDir,
			`${target.out.replace(/[/.]/g, "_")}_${size}.png`,
		);
		await writeFile(tmpPng, buffer);
		pngPaths.push(tmpPng);
	}

	const icoBuffer = await pngToIco(pngPaths);
	await writeFile(abs, icoBuffer);

	// Verify by parsing the ICO directory itself (sharp cannot read .ico).
	// ICO layout: bytes[4..6] = little-endian image count; then one 16-byte
	// ICONDIRENTRY per image starting at offset 6, whose byte[0] is the width
	// (0 encodes 256).
	const packed = readIcoSizes(icoBuffer);
	const expected = [...target.sizes].sort((a, b) => a - b).join("/");
	const got = packed.join("/");
	if (got !== expected) {
		throw new Error(
			`ICO assertion failed for ${target.out}: expected sizes [${expected}], got [${got}]`,
		);
	}
	console.log(
		`  ICO  ${target.out.padEnd(44)} packed=[${got}] (${icoBuffer.length} B)`,
	);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
	// Fail fast if the canonical source is wrong shape.
	const srcMeta = await sharp(SOURCE).metadata();
	if (srcMeta.width !== 1024 || srcMeta.height !== 1024) {
		throw new Error(
			`Unexpected source dimensions: ${srcMeta.width}x${srcMeta.height} (expected 1024x1024) at ${SOURCE}`,
		);
	}
	console.log(
		`Source: ${path.relative(REPO_ROOT, SOURCE)} (${srcMeta.width}x${srcMeta.height})`,
	);
	console.log(`Girl crop box: ${JSON.stringify(GIRL_BOX)}`);
	console.log("");

	console.log("Regenerating PNG brand icons:");
	for (const target of PNG_TARGETS) {
		await writePng(target);
	}

	console.log("");
	console.log("Regenerating .ico brand icons:");
	const scratchDir = await mkdtemp(path.join(tmpdir(), "rox-icons-"));
	try {
		for (const target of ICO_TARGETS) {
			await writeIco(target, scratchDir);
		}
	} finally {
		await rm(scratchDir, { recursive: true, force: true });
	}

	console.log("");
	console.log(
		`Done. ${PNG_TARGETS.length} PNG + ${ICO_TARGETS.length} ICO brand icons regenerated.`,
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
