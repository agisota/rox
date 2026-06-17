"use client";

import { COMPANY } from "@rox/shared/constants";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

interface FooterLink {
	href: string;
	label: ReactNode;
	external?: boolean;
}

const FOOTER_LINKS: FooterLink[] = [
	{
		href: COMPANY.DOCS_URL,
		label: "Документация",
		external: true,
	},
	{
		href: "/changelog",
		label: (
			<span className="inline-flex items-center gap-2">
				Changelog
				<span className="rox-footer__badge" title="Новые записи">
					new
				</span>
			</span>
		),
	},
	{
		href: "/legal",
		label: (
			<span className="inline-flex flex-col items-center leading-[1.15] text-center">
				<span>Условия и</span>
				<span>конфиденциальность</span>
			</span>
		),
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
					isHome ? "pb-5 pt-3 sm:pb-6" : "pb-8 pt-5 sm:pb-10"
				}`}
			>
				<nav
					className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:gap-x-5"
					aria-label="Нижняя навигация"
				>
					{FOOTER_LINKS.map((link) => (
						<FooterLinkItem key={link.href} link={link} />
					))}
				</nav>
				<p className={`${FOOTER_TEXT} mt-2 text-center`}>
					© {new Date().getFullYear()} Rox
				</p>
			</div>
		</footer>
	);
}

function FooterLinkItem({ link }: { link: FooterLink }) {
	const className = `group inline-flex items-center gap-1 font-sans text-[calc(0.8125rem/1.5)] font-extralight text-white/30 transition-colors hover:text-white/48`;

	if (link.external) {
		return (
			<a
				href={link.href}
				target="_blank"
				rel="noopener noreferrer"
				className={className}
			>
				{link.label}
				<ArrowUpRight className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
			</a>
		);
	}

	return (
		<Link href={link.href} className={className}>
			{link.label}
		</Link>
	);
}
