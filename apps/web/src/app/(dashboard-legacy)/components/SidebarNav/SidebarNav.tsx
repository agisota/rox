"use client";

import { cn } from "@rox/ui/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useTranslation } from "@/i18n";

export function SidebarNav() {
	const { t } = useTranslation();
	const pathname = usePathname();
	const navItems = [
		{ href: "/", label: t.nav.home },
		{ href: "/integrations", label: t.nav.integrations },
	];

	return (
		<nav className="mt-4 flex flex-col items-start gap-3 md:mt-8">
			{navItems.map((item) => {
				const isActive =
					item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
				return (
					<Link
						key={item.href}
						href={item.href}
						className={cn(
							"font-mono transition-opacity",
							isActive
								? "underline opacity-100"
								: "opacity-60 hover:opacity-80",
						)}
					>
						{item.label}
					</Link>
				);
			})}
		</nav>
	);
}
