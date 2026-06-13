"use client";

import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Reveal } from "../primitives/Reveal";

export interface ManifestoLine {
	/** Stable identity for the line (also the React key). */
	id: string;
	/** The statement, rendered large in the display face. */
	text: string;
}

export interface ManifestoBlockProps {
	/** The statements, each revealed on its own masked line. */
	lines: ManifestoLine[];
	/** Small label above the statement (mono, noise token). */
	kicker?: ReactNode;
	className?: string;
}

/**
 * A manifesto: large display-face statements that reveal line-by-line from
 * behind a mask. Renders through the `font-frame-display` utility so it inherits
 * the active typeface theme, and uses the `Reveal` primitive so each line is
 * entrance-gated — under `off` / reduced-motion every line renders static and
 * fully visible. Lines carry a stable `id` so repeated statements never collapse
 * and editing a line is a prop update rather than an unmount/remount.
 */
export function ManifestoBlock({
	lines,
	kicker,
	className,
}: ManifestoBlockProps) {
	return (
		<div className={cn("flex w-full flex-col gap-2", className)}>
			{kicker ? (
				<span className="font-frame-mono text-muted-foreground text-xs uppercase tracking-widest">
					{kicker}
				</span>
			) : null}
			{lines.map((line, index) => (
				<Reveal delay={index * 0.08} key={line.id}>
					<p className="font-frame-display font-semibold text-2xl text-foreground leading-tight">
						{line.text}
					</p>
				</Reveal>
			))}
		</div>
	);
}
