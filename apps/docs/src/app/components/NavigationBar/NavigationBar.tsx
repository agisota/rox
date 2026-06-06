"use client";

import { COMPANY } from "@superset/shared/constants";
import { Menu } from "lucide-react";
import Link from "next/link";
import { MobileSearchIcon } from "@/app/(docs)/[[...slug]]/components/DocsPageLayout/components/PageClient/components/MobileSearchIcon";
import {
	NavigationMobile,
	useNavbarMobile,
} from "./components/NavigationMobile";

function SupersetLogo() {
	return (
		<span className="inline-flex items-center gap-2 text-foreground">
			<span className="grid size-5 place-items-center rounded bg-foreground text-[10px] font-semibold text-background">
				СА
			</span>
			<span className="font-semibold">{COMPANY.NAME}</span>
		</span>
	);
}

function SidebarTrigger() {
	const { toggleNavbar } = useNavbarMobile();

	return (
		<button
			type="button"
			aria-label="Открыть меню"
			className="navbar:hidden flex items-center justify-center p-2"
			onClick={toggleNavbar}
		>
			<Menu className="size-5" />
		</button>
	);
}

export default function NavigationBar() {
	return (
		<div className="flex flex-col sticky top-0 bg-background backdrop-blur-md z-30">
			<nav className="md:grid grid-cols-12 border-b flex items-center justify-between">
				<a
					href={COMPANY.MARKETING_URL}
					className="min-navbar:border-r md:px-5 px-2.5 py-4 text-foreground md:col-span-2 shrink-0 transition-colors md:w-[268px] lg:w-[286px]"
				>
					<SupersetLogo />
				</a>
				<div className="md:col-span-10 flex items-center justify-end relative px-4 gap-4">
					<MobileSearchIcon />
					<SidebarTrigger />
					<ul className="navbar:flex items-center gap-6 hidden shrink-0">
						<NavLink
							href={COMPANY.GITHUB_URL}
							external
							aria-label={`Открыть исходный код ${COMPANY.NAME}`}
						>
							Исходный код
						</NavLink>
					</ul>
				</div>
			</nav>
			<NavigationMobile />
		</div>
	);
}

interface NavLinkProps {
	href: string;
	children: React.ReactNode;
	external?: boolean;
	className?: string;
	"aria-label"?: string;
}

function NavLink({
	href,
	children,
	external,
	className,
	...props
}: NavLinkProps) {
	const baseClasses =
		"px-4 py-2 text-sm hover:text-foreground transition-colors text-muted-foreground";

	if (external) {
		return (
			<a
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				className={`${baseClasses} ${className || ""}`}
				{...props}
			>
				{children}
			</a>
		);
	}

	return (
		<Link
			href={href}
			className={`${baseClasses} ${className || ""}`}
			{...props}
		>
			{children}
		</Link>
	);
}
