"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DesktopNav } from "./components/DesktopNav";
import { MobileNav } from "./components/MobileNav";
import { RoxLogo } from "./components/RoxLogo";

interface HeaderProps {
	ctaButtons: React.ReactNode;
	starCounter?: React.ReactNode;
}

export function Header({ ctaButtons, starCounter }: HeaderProps) {
	const pathname = usePathname();
	if (pathname === "/download") return null;

	return (
		<header className="fixed inset-x-0 top-3 z-50 flex justify-center px-4">
			<motion.nav
				initial={{ opacity: 0, y: -8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.3 }}
				className="flex w-full max-w-3xl items-center justify-between gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 shadow-lg backdrop-blur-md"
			>
				<Link
					href="/"
					className="flex shrink-0 items-center text-foreground transition-colors hover:text-foreground/80"
				>
					<RoxLogo />
				</Link>

				<div className="hidden items-center gap-3 md:flex">
					<DesktopNav />
					<div className="h-4 w-px bg-border" />
					{starCounter}
					<div className="flex items-center gap-2">{ctaButtons}</div>
				</div>

				<MobileNav ctaButtons={ctaButtons} starCounter={starCounter} />
			</motion.nav>
		</header>
	);
}
