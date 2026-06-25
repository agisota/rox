import fs from "node:fs";
import path from "node:path";
import { COMPANY } from "@rox/shared/constants";
import { ImageResponse } from "next/og";

/**
 * Site-wide Open Graph / Twitter card (#520, follows the #484 brand wave).
 *
 * The previous OG was a static `public/og-image.png` in the old style. This
 * App-Router file-convention route regenerates the banner on the brand: premium
 * black canvas, the Rox girl-mark, and the Victor Mono brand typeface. Using the
 * file convention means Next injects it into the root metadata automatically, so
 * every page that doesn't define its own OG inherits the branded card.
 *
 * The Victor Mono faces are vendored as TTFs next to this route (satori needs
 * ttf/otf, not the woff2 the desktop ships) and read from disk — no runtime
 * network fetch, so the card renders deterministically.
 */

export const alt = `${COMPANY.NAME} — параллельные кодинг-агенты на твоей машине`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const APP_DIR = path.join(process.cwd(), "src", "app");
const PUBLIC_DIR = path.join(process.cwd(), "public");

function readFont(file: string): Buffer {
	return fs.readFileSync(path.join(APP_DIR, "_fonts", file));
}

function readMarkDataUri(): string {
	const buffer = fs.readFileSync(
		path.join(PUBLIC_DIR, "brand", "girl-mark.png"),
	);
	return `data:image/png;base64,${buffer.toString("base64")}`;
}

export default function Image() {
	const regular = readFont("VictorMono-Regular.ttf");
	const bold = readFont("VictorMono-Bold.ttf");
	const markDataUri = readMarkDataUri();

	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				// Premium black canvas with a faint radial lift behind the mark.
				background:
					"radial-gradient(120% 120% at 80% 0%, #161616 0%, #0a0a0a 55%, #050505 100%)",
				padding: "72px 80px",
				fontFamily: "Victor Mono",
				color: "#ffffff",
			}}
		>
			{/* Top row: girl-mark + wordmark */}
			<div style={{ display: "flex", alignItems: "center", gap: 28 }}>
				{/* biome-ignore lint/a11y/useAltText: ImageResponse requires native <img> */}
				{/* biome-ignore lint/performance/noImgElement: ImageResponse requires native <img> */}
				<img
					src={markDataUri}
					width={104}
					height={104}
					style={{ borderRadius: 24 }}
				/>
				<div
					style={{
						fontSize: 64,
						fontWeight: 700,
						letterSpacing: "-0.02em",
					}}
				>
					{COMPANY.NAME}
				</div>
			</div>

			{/* Headline */}
			<div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
				<div
					style={{
						fontSize: 60,
						fontWeight: 700,
						lineHeight: 1.1,
						letterSpacing: "-0.02em",
						maxWidth: "92%",
					}}
				>
					Параллельные кодинг-агенты на твоей машине
				</div>
				<div
					style={{
						fontSize: 28,
						color: "#a1a1a1",
						maxWidth: "80%",
						lineHeight: 1.35,
					}}
				>
					Запускай 10+ агентов параллельно — каждый в своём изолированном Git
					worktree.
				</div>
			</div>
		</div>,
		{
			...size,
			fonts: [
				{ name: "Victor Mono", data: regular, weight: 400, style: "normal" },
				{ name: "Victor Mono", data: bold, weight: 700, style: "normal" },
			],
		},
	);
}
