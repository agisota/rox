"use client";

import { cn } from "@rox/ui/utils";
import { type ReactNode, useId } from "react";

interface GlossaryTermProps {
	children: ReactNode;
	description: ReactNode;
	kind?: "term" | "properNoun";
	className?: string;
}

export function GlossaryTerm({
	children,
	description,
	kind = "term",
	className,
}: GlossaryTermProps) {
	const tooltipId = useId();

	return (
		<span className="group relative inline-block align-baseline">
			<button
				type="button"
				aria-describedby={tooltipId}
				className={cn(
					"inline cursor-help appearance-none border-0 bg-transparent p-0 align-baseline font-[inherit] text-inherit decoration-border decoration-dotted underline underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
					kind === "properNoun" &&
						"font-semibold text-foreground decoration-foreground/60",
					className,
				)}
			>
				{children}
			</button>
			<span
				id={tooltipId}
				role="tooltip"
				className="-translate-x-1/2 pointer-events-none invisible absolute top-full left-1/2 z-50 mt-2 w-max max-w-[260px] rounded-md border border-white/10 bg-zinc-950/95 px-3 py-2 text-left text-xs leading-relaxed text-zinc-100 opacity-0 shadow-xl shadow-black/25 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
			>
				{description}
			</span>
		</span>
	);
}
