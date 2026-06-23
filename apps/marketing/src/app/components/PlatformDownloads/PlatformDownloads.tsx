"use client";

import Link from "next/link";
import { track } from "@/lib/analytics";
import { isMacPlatform, Platform, usePlatform } from "../../hooks/useOS";
import { AppleGlyph, LinuxGlyph, WindowsGlyph } from "./icons";
import styles from "./PlatformDownloads.module.css";

type OsKey = "mac" | "windows" | "linux";

interface PlatformTile {
	os: OsKey;
	label: string;
	sub: string;
	icon: React.ReactNode;
}

const TILES: readonly PlatformTile[] = [
	{
		os: "mac",
		label: "macOS",
		sub: "Apple Silicon",
		icon: <AppleGlyph />,
	},
	{ os: "windows", label: "Windows", sub: "x64", icon: <WindowsGlyph /> },
	{ os: "linux", label: "Linux", sub: "AppImage", icon: <LinuxGlyph /> },
];

function osForPlatform(platform: Platform): OsKey | null {
	if (isMacPlatform(platform)) return "mac";
	if (platform === Platform.Windows) return "windows";
	if (platform === Platform.Linux) return "linux";
	return null;
}

interface PlatformDownloadsProps {
	className?: string;
	/** "hero" = compact row for the landing; "page" = larger tiles for /download. */
	variant?: "hero" | "page";
}

/**
 * Neat per-platform download buttons (Zed-style): a muted platform glyph that
 * brightens on hover, with the visitor's detected OS highlighted as the
 * recommended build. Each tile routes to the /download interstitial with the
 * chosen OS so the real release asset is fetched there.
 */
export function PlatformDownloads({
	className = "",
	variant = "hero",
}: PlatformDownloadsProps) {
	const { platform } = usePlatform();
	const recommended = osForPlatform(platform);

	return (
		<div className={`${styles.grid} ${className}`} data-variant={variant}>
			{TILES.map((tile) => {
				const isRecommended = tile.os === recommended;
				return (
					<Link
						key={tile.os}
						href={`/download?os=${tile.os}`}
						className={styles.tile}
						data-recommended={isRecommended || undefined}
						onClick={() => track("download_clicked", { os: tile.os })}
					>
						<span className={styles.icon}>{tile.icon}</span>
						<span className={styles.body}>
							<span className={styles.label}>{tile.label}</span>
							<span className={styles.sub}>{tile.sub}</span>
						</span>
						<span className={styles.arrow} aria-hidden="true">
							<svg viewBox="0 0 12 14" fill="none" aria-hidden="true">
								<path
									d="M6 1.25v9.5"
									stroke="currentColor"
									strokeWidth="1.15"
									strokeLinecap="round"
								/>
								<path
									d="M2.75 8.25 6 11.75 9.25 8.25"
									stroke="currentColor"
									strokeWidth="1.15"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						</span>
					</Link>
				);
			})}
		</div>
	);
}
