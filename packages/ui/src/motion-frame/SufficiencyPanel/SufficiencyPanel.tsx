"use client";

import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { FadeLift } from "../primitives/FadeLift";
import { PulseDot } from "../primitives/PulseDot";

/** The four facets that must all be filled before a task is "set" (S✷). */
const FACETS = ["context", "tools", "rights", "criteria"] as const;

type Facet = (typeof FACETS)[number];

const FACET_LABEL: Record<Facet, string> = {
	context: "Context",
	tools: "Tools",
	rights: "Rights",
	criteria: "Criteria",
};

export interface SufficiencyPanelProps {
	/** What the task knows. */
	context?: ReactNode;
	/** What it can act with. */
	tools?: ReactNode;
	/** What it is allowed to touch. */
	rights?: ReactNode;
	/** How "done" is judged. */
	criteria?: ReactNode;
	/** Panel heading. */
	title?: ReactNode;
	className?: string;
}

/**
 * The sufficiency model as a 2×2 panel: a task is only "set" (S✷) once all four
 * facets — context, tools, rights, criteria — are filled. Filled facets read in
 * the `verified` token, missing ones in `noise`, and the header summary flips to
 * "set" only when every facet is present. The whole panel fades in once via
 * `FadeLift`, so under `off` / reduced-motion it renders fully static.
 */
export function SufficiencyPanel({
	context,
	tools,
	rights,
	criteria,
	title = "Sufficiency",
	className,
}: SufficiencyPanelProps) {
	const facets: Record<Facet, ReactNode> = {
		context,
		tools,
		rights,
		criteria,
	};
	const filled = FACETS.filter((facet) => facets[facet] != null);
	const allSet = filled.length === FACETS.length;

	return (
		<FadeLift
			className={cn(
				"w-full rounded-lg border border-border bg-card p-4 text-card-foreground",
				className,
			)}
		>
			<header
				className="mb-3 flex items-center justify-between gap-2"
				data-sufficiency={allSet ? "set" : "partial"}
			>
				<span className="font-medium text-sm">{title}</span>
				<span className="flex items-center gap-2 text-muted-foreground text-xs">
					<PulseDot state={allSet ? "verified" : "transition"} />
					{allSet ? "set" : `${filled.length}/${FACETS.length}`}
				</span>
			</header>
			<dl className="grid grid-cols-2 gap-3">
				{FACETS.map((facet) => {
					const value = facets[facet];
					const present = value != null;
					return (
						<div
							className="flex flex-col gap-1 rounded-md border border-border p-3"
							data-facet={facet}
							key={facet}
						>
							<dt className="flex items-center gap-2 font-mono text-xs uppercase tracking-wide">
								<PulseDot size={6} state={present ? "verified" : "noise"} />
								{FACET_LABEL[facet]}
							</dt>
							<dd className="text-sm">
								{present ? (
									value
								) : (
									<span className="text-muted-foreground italic">missing</span>
								)}
							</dd>
						</div>
					);
				})}
			</dl>
		</FadeLift>
	);
}
