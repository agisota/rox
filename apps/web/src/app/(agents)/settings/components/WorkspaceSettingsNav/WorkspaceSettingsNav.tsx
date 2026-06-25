"use client";

import { cn } from "@rox/ui/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
	{ href: "/settings/organization", label: "Организация" },
	{ href: "/settings/members", label: "Участники" },
	{ href: "/settings/teams", label: "Команды" },
] as const;

/**
 * Consolidated "Workspaces / Управление" sub-navigation for the org/members/
 * teams settings pages (Hermes-borrow F27). Mirrors the desktop settings
 * grouping so web users get one management entry point.
 */
export function WorkspaceSettingsNav() {
	const pathname = usePathname();

	return (
		<nav className="mb-8 flex gap-1 border-b">
			{NAV_ITEMS.map((item) => {
				const isActive = pathname === item.href;
				return (
					<Link
						key={item.href}
						href={item.href}
						className={cn(
							"-mb-px border-b-2 px-3 py-2 font-medium text-sm transition-colors",
							isActive
								? "border-foreground text-foreground"
								: "border-transparent text-muted-foreground hover:text-foreground",
						)}
					>
						{item.label}
					</Link>
				);
			})}
		</nav>
	);
}
