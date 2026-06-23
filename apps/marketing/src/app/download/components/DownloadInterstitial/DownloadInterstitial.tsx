"use client";

import {
	DOWNLOAD_URL_LINUX,
	DOWNLOAD_URL_MAC_ARM64,
	DOWNLOAD_URL_MAC_X64,
	DOWNLOAD_URL_WIN_X64,
} from "@rox/shared/constants";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { RoxLogo } from "@/app/components/Header/components/RoxLogo";
import { PlatformDownloads } from "@/app/components/PlatformDownloads";
import { isMacPlatform, Platform, usePlatform } from "@/app/hooks/useOS";
import { GlossaryText } from "@/components/GlossaryTerm";
import { track } from "@/lib/analytics";

const AUTO_DOWNLOAD_DELAY_MS = 600;

type OsKey = "mac" | "windows" | "linux";

function normalizeOs(os?: string): OsKey | undefined {
	return os === "mac" || os === "windows" || os === "linux" ? os : undefined;
}

function osForPlatform(platform: Platform): OsKey | undefined {
	if (isMacPlatform(platform)) return "mac";
	if (platform === Platform.Windows) return "windows";
	if (platform === Platform.Linux) return "linux";
	return undefined;
}

function urlForOs(os: OsKey, platform: Platform): string {
	switch (os) {
		case "windows":
			return DOWNLOAD_URL_WIN_X64;
		case "linux":
			return DOWNLOAD_URL_LINUX;
		default:
			return platform === Platform.MacIntel
				? DOWNLOAD_URL_MAC_X64
				: DOWNLOAD_URL_MAC_ARM64;
	}
}

interface DownloadInterstitialProps {
	/** Forced platform from `?os=` on the download link. */
	os?: string;
}

export function DownloadInterstitial({ os }: DownloadInterstitialProps) {
	const { platform } = usePlatform();
	const firedRef = useRef(false);

	const targetOs = normalizeOs(os) ?? osForPlatform(platform);

	useEffect(() => {
		if (firedRef.current) return;
		if (!targetOs) return;
		// For macOS wait until arch detection has resolved so we pick the right
		// .dmg; Windows/Linux have a single build and can fire immediately.
		if (targetOs === "mac" && platform === Platform.Unknown) return;

		firedRef.current = true;
		const url = urlForOs(targetOs, platform);
		track("download_started", { os: targetOs });

		window.setTimeout(() => {
			window.location.href = url;
		}, AUTO_DOWNLOAD_DELAY_MS);
	}, [targetOs, platform]);

	return (
		<div className="relative isolate min-h-screen overflow-hidden bg-background px-6 py-10 sm:px-12 sm:py-14 lg:px-20 lg:py-20">
			<Link
				href="/"
				className="inline-flex items-center text-foreground transition-colors hover:text-foreground/80"
				aria-label="Rox"
			>
				<RoxLogo />
			</Link>

			<div className="mt-20 grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
				<div className="flex flex-col gap-6">
					<h1
						className="text-3xl font-medium tracking-tight text-foreground sm:text-4xl md:text-5xl lg:text-6xl"
						style={{ fontFamily: "var(--font-ibm-plex-mono), monospace" }}
					>
						{targetOs ? "Сейчас начнётся загрузка Rox" : "Скачайте Rox"}
					</h1>
					<p className="text-sm text-muted-foreground sm:text-base">
						{targetOs ? (
							<>
								<GlossaryText text="Загрузка начнётся автоматически. Если она не началась, " />
								<a
									href={urlForOs(targetOs, platform)}
									onClick={() =>
										track("download_manual_clicked", { os: targetOs })
									}
									className="text-foreground underline underline-offset-4"
								>
									скачайте вручную
								</a>
								<GlossaryText text=" или выберите другую платформу ниже." />
							</>
						) : (
							<GlossaryText text="Выберите платформу, чтобы скачать последнюю версию Rox." />
						)}
					</p>

					<PlatformDownloads variant="page" className="mt-2" />
				</div>

				<div
					aria-hidden="true"
					className="relative flex items-center justify-center"
				>
					<div className="pointer-events-none absolute inset-0 -z-10 flex items-center justify-center">
						<div className="size-72 rounded-full bg-brand/20 blur-3xl sm:size-96" />
					</div>
					<Image
						src="/rox-logo-light.png"
						alt=""
						width={260}
						height={396}
						priority
						className="h-auto w-40 select-none drop-shadow-[0_0_60px_rgba(255,140,58,0.25)] sm:w-52 lg:w-60"
					/>
				</div>
			</div>
		</div>
	);
}
