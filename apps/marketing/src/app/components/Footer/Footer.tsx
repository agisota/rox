"use client";

import { COMPANY } from "@rox/shared/constants";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

function RoxLogo() {
	return (
		<Image
			src="/rox-logo-light.png"
			alt="Rox"
			width={683}
			height={1040}
			className="h-[70px] w-auto opacity-90"
		/>
	);
}

interface FooterLink {
	href: string;
	label: string;
	external?: boolean;
}

const COMPANY_LINKS: FooterLink[] = [
	{ href: "/contact", label: "Контакты" },
	{ href: COMPANY.STATUS_URL, label: "Статус", external: true },
];

const RESOURCE_LINKS: FooterLink[] = [
	{ href: COMPANY.DOCS_URL, label: "Документация", external: true },
	{ href: "/blog", label: "Блог" },
	{ href: "/changelog", label: "Журнал изменений" },
];

const LEGAL_LINKS: FooterLink[] = [
	{ href: COMPANY.TRUST_URL, label: "Безопасность", external: true },
	{ href: "/terms", label: "Условия" },
	{ href: "/privacy", label: "Конфиденциальность" },
];

export function Footer() {
	const pathname = usePathname();
	if (pathname === "/download") return null;

	return (
		<footer>
			<motion.div
				initial={{ opacity: 0 }}
				whileInView={{ opacity: 1 }}
				viewport={{ once: true }}
				transition={{ duration: 0.5 }}
				className="max-w-7xl mx-auto px-6 sm:px-8 pt-6 pb-10 sm:pt-8 sm:pb-12"
			>
				<div className="grid grid-cols-2 gap-10 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:gap-x-20">
					<div className="col-span-2 flex flex-col gap-6 md:col-span-1">
						<Link
							href="/"
							className="inline-block text-foreground transition-colors hover:text-foreground/80"
						>
							<RoxLogo />
						</Link>
						<p className="text-sm text-muted-foreground">
							© {new Date().getFullYear()} ROX ONE PUBLIC BENEFIT COMPANY
						</p>
					</div>

					<FooterColumn title="Компания" links={COMPANY_LINKS} />
					<FooterColumn title="Ресурсы" links={RESOURCE_LINKS} />
					<FooterColumn title="Правовая информация" links={LEGAL_LINKS} />
				</div>
			</motion.div>
		</footer>
	);
}

function FooterColumn({
	title,
	links,
}: {
	title: string;
	links: FooterLink[];
}) {
	return (
		<div className="flex flex-col gap-4">
			<p className="text-sm font-medium text-foreground">{title}</p>
			<ul className="flex flex-col gap-3">
				{links.map((link) => (
					<li key={link.href}>
						<FooterLinkItem link={link} />
					</li>
				))}
			</ul>
		</div>
	);
}

function FooterLinkItem({ link }: { link: FooterLink }) {
	const className =
		"group inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground";
	if (link.external) {
		return (
			<a
				href={link.href}
				target="_blank"
				rel="noopener noreferrer"
				className={className}
			>
				{link.label}
				<ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
			</a>
		);
	}
	return (
		<Link href={link.href} className={className}>
			{link.label}
		</Link>
	);
}
