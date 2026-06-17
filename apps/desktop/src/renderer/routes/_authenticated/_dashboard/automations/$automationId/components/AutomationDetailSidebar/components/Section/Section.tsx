import { AnimatedHeight, useShouldAnimate } from "@rox/ui/motion";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { SectionTitle } from "../SectionTitle";

export function Section({
	title,
	children,
	collapsible = false,
	defaultOpen = true,
}: {
	title: string;
	children: ReactNode;
	collapsible?: boolean;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);
	const shouldAnimate = useShouldAnimate("essential");

	if (!collapsible) {
		return (
			<section className="flex flex-col gap-3">
				<SectionTitle>{title}</SectionTitle>
				<div className="flex flex-col">{children}</div>
			</section>
		);
	}

	return (
		<section className="flex flex-col gap-3">
			<button
				type="button"
				onClick={() => setOpen((prev) => !prev)}
				className="flex items-center gap-1 text-left"
				aria-expanded={open}
			>
				<SectionTitle>{title}</SectionTitle>
				<motion.span
					style={{ display: "inline-flex" }}
					animate={shouldAnimate ? { rotate: open ? 0 : -90 } : undefined}
					transition={{ duration: 0.15 }}
				>
					<ChevronDown className="size-3 text-muted-foreground" />
				</motion.span>
			</button>
			<AnimatedHeight open={open}>
				<div className="flex flex-col">{children}</div>
			</AnimatedHeight>
		</section>
	);
}
