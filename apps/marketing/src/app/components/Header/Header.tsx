"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DesktopNav } from "./components/DesktopNav";
import { MobileNav } from "./components/MobileNav";
import { RoxLogo } from "./components/RoxLogo";
import { SessionHeaderCTA } from "./components/SessionHeaderCTA";

interface HeaderProps {
	dashboardUrl: string;
}

export function Header({ dashboardUrl }: HeaderProps) {
	const pathname = usePathname();
	if (pathname === "/" || pathname === "/download") return null;

	const ctaButtons = <SessionHeaderCTA dashboardUrl={dashboardUrl} />;

	return (
		<header className="fixed inset-x-0 top-6 z-50 flex justify-center px-4">
			<nav className="flex w-full max-w-3xl items-center justify-between gap-2 rounded-full border border-white/10 bg-[#0c0806]/75 px-4 py-2 shadow-[0_18px_60px_rgba(0,0,0,0.32)] backdrop-blur-xl">
				<Link
					href="/"
					className="flex shrink-0 items-center text-foreground transition-colors hover:text-foreground/80"
				>
					<RoxLogo />
				</Link>

				<div className="hidden items-center gap-3 md:flex">
					<DesktopNav />
					<div className="h-4 w-px bg-border" />
					<div className="flex items-center gap-2">{ctaButtons}</div>
				</div>

				<MobileNav ctaButtons={ctaButtons} />
			</nav>
		</header>
	);
}
