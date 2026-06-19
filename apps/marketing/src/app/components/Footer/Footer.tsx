"use client";

import { COMPANY } from "@rox/shared/constants";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { RoxLogo } from "../Header/components/RoxLogo";

interface FooterLink {
	id: "changelog" | "docs" | "legal";
	href: string;
	label: ReactNode;
	badge?: string;
	external?: boolean;
}

const FOOTER_LINKS: FooterLink[] = [
	{
		id: "changelog",
		href: "/changelog",
		label: "Changelog",
		badge: "new",
	},
	{
		id: "docs",
		href: COMPANY.DOCS_URL,
		label: "Документация",
		external: true,
	},
	{
		id: "legal",
		href: "/legal",
		label: "Юридическая информация",
	},
];

const FOOTER_TEXT =
	"font-sans text-[11px] font-extralight tracking-wide text-white/24";

export function Footer() {
	const pathname = usePathname();
	if (pathname === "/download") return null;

	const isHome = pathname === "/";

	return (
		<footer
			className={
				isHome
					? "pointer-events-none fixed inset-x-0 bottom-0 z-30"
					: "relative z-10"
			}
		>
			<div
				className={`pointer-events-auto mx-auto max-w-7xl px-5 sm:px-8 ${
					isHome ? "pb-14 pt-3 sm:pb-16" : "pb-8 pt-5 sm:pb-10"
				}`}
			>
				<nav
					className={
						isHome
							? "flex flex-nowrap items-center justify-center gap-x-5 overflow-visible whitespace-nowrap sm:gap-x-14 md:gap-x-20"
							: "flex flex-wrap items-center justify-center gap-x-7 gap-y-2 sm:gap-x-9"
					}
					aria-label="Нижняя навигация"
				>
					{FOOTER_LINKS.map((link) => (
						<FooterLinkItem key={link.href} link={link} isHome={isHome} />
					))}
				</nav>
				{isHome ? (
					<Link
						href="/"
						aria-label="Rox"
						className="mx-auto mt-20 flex w-fit items-center justify-center text-white/70 opacity-50 transition-[color,opacity] hover:text-white hover:opacity-100 [&_img]:h-[54px] [&_img]:w-auto"
					>
						<RoxLogo />
					</Link>
				) : (
					<p className={`${FOOTER_TEXT} mt-7 text-center sm:mt-8`}>
						© {new Date().getFullYear()} Rox
					</p>
				)}
			</div>
		</footer>
	);
}

function FooterLinkItem({
	link,
	isHome,
}: {
	link: FooterLink;
	isHome: boolean;
}) {
	const className = isHome
		? "group relative inline-flex min-w-0 items-center gap-1 font-sans text-[9px] font-extralight leading-none tracking-[0.12em] text-white/36 transition-colors hover:text-white/62 sm:text-[10px]"
		: "group inline-flex items-center gap-1.5 font-sans text-[13px] font-light text-white/45 transition-colors hover:text-white/70";
	const content = (
		<>
			{link.label}
			{isHome && link.badge ? (
				<span
					className="absolute -top-2.5 right-0 font-sans text-[6px] font-light leading-none tracking-[0.14em] text-[#ff8a3d]/85 sm:-top-3 sm:text-[7px]"
					data-footer-badge={`${link.id}-${link.badge}`}
				>
					{link.badge}
				</span>
			) : null}
		</>
	);

	if (link.external) {
		return (
			<a
				href={link.href}
				target="_blank"
				rel="noopener noreferrer"
				className={className}
				data-footer-link={link.id}
			>
				{content}
				{isHome ? null : <ArrowUpRight className="rox-footer__arrow h-3 w-3" />}
			</a>
		);
	}

	return (
		<Link href={link.href} className={className} data-footer-link={link.id}>
			{content}
		</Link>
	);
}
