"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { cn } from "@rox/ui/utils";
import type { ReactNode } from "react";

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
	return (
		<Tooltip delayDuration={120}>
			<TooltipTrigger asChild>
				<button
					type="button"
					className={cn(
						"inline cursor-help appearance-none border-0 bg-transparent p-0 align-baseline font-[inherit] text-inherit decoration-border decoration-dotted underline underline-offset-4 transition-colors hover:decoration-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
						kind === "properNoun" &&
							"font-semibold text-foreground decoration-foreground/60",
						className,
					)}
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent
				sideOffset={8}
				className="max-w-[260px] rounded-md border border-white/10 bg-zinc-950/95 px-3 py-2 text-left text-xs leading-relaxed text-zinc-100 shadow-xl shadow-black/25"
				arrowClassName="bg-zinc-950 fill-zinc-950"
			>
				{description}
			</TooltipContent>
		</Tooltip>
	);
}
