"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
	type NavLink,
	PRODUCT_LINKS,
	RESOURCE_LINKS,
	TOP_LEVEL_LINKS,
} from "../../constants";

interface MobileNavProps {
	ctaButtons: React.ReactNode;
}

export function MobileNav({ ctaButtons }: MobileNavProps) {
	const [isOpen, setIsOpen] = useState(false);
	const close = () => setIsOpen(false);

	return (
		<div className="md:hidden">
			<button
				type="button"
				className="p-2 text-muted-foreground hover:text-foreground transition-colors"
				onClick={() => setIsOpen((prev) => !prev)}
				aria-label={isOpen ? "Закрыть меню" : "Открыть меню"}
				aria-expanded={isOpen}
			>
				{isOpen ? <X className="size-5" /> : <Menu className="size-5" />}
			</button>

			<AnimatePresence>
				{isOpen && (
					<motion.div
						className="fixed left-1/2 top-[4.75rem] z-50 w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 overflow-hidden rounded-2xl border border-white/10 bg-background/95 shadow-lg backdrop-blur-xl"
						initial={{ opacity: 0, y: -8 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -8 }}
						transition={{ duration: 0.2 }}
					>
						<div className="flex flex-col gap-6 px-5 py-4">
							<MobileSection
								title="Продукт"
								links={PRODUCT_LINKS}
								onNavigate={close}
							/>
							<MobileSection
								title="Ресурсы"
								links={RESOURCE_LINKS}
								onNavigate={close}
							/>
							<MobileSection links={TOP_LEVEL_LINKS} onNavigate={close} />
							<div className="pt-4 border-t border-border flex flex-col gap-3">
								{ctaButtons}
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

function MobileSection({
	title,
	links,
	onNavigate,
}: {
	title?: string;
	links: NavLink[];
	onNavigate: () => void;
}) {
	return (
		<div className="flex flex-col gap-1">
			{title && (
				<p className="px-2 pb-1 text-xs uppercase tracking-wide text-muted-foreground/70">
					{title}
				</p>
			)}
			{links.map((link) =>
				link.external ? (
					<a
						key={link.href}
						href={link.href}
						target="_blank"
						rel="noopener noreferrer"
						className="px-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						{link.label}
					</a>
				) : (
					<Link
						key={link.href}
						href={link.href}
						onClick={onNavigate}
						className="px-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						{link.label}
					</Link>
				),
			)}
		</div>
	);
}
