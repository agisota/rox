"use client";

import { motion } from "motion/react";
import { useId, useState } from "react";
import { cn } from "../../lib/utils";
import { springs } from "../springs";
import { useShouldAnimate } from "../useShouldAnimate";

export interface SegmentedOption {
	value: string;
	label: string;
}

export interface SegmentedProps {
	options: SegmentedOption[];
	/** Controlled active value. Omit for uncontrolled use. */
	value?: string;
	/** Initial value when uncontrolled. */
	defaultValue?: string;
	onValueChange?: (value: string) => void;
	className?: string;
}

/**
 * Two-or-more-way segmented toggle with a spring "glider" that slides under the
 * active option — the State-First focus toggle (HOW ↔ WHAT). Controlled or
 * uncontrolled. The glider rides a shared `layoutId`; under reduced motion it
 * jumps instantly instead of sliding.
 */
export function Segmented({
	options,
	value,
	defaultValue,
	onValueChange,
	className,
}: SegmentedProps) {
	const layoutId = useId();
	const shouldAnimate = useShouldAnimate();
	const [internal, setInternal] = useState(
		defaultValue ?? options[0]?.value ?? "",
	);
	const active = value ?? internal;

	function select(next: string) {
		if (value === undefined) {
			setInternal(next);
		}
		onValueChange?.(next);
	}

	return (
		<div
			className={cn(
				"relative inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 p-1",
				className,
			)}
		>
			{options.map((option) => {
				const isActive = option.value === active;
				return (
					<button
						key={option.value}
						type="button"
						onClick={() => select(option.value)}
						className={cn(
							"relative z-10 rounded-full px-3 py-1 text-xs font-medium transition-colors",
							isActive ? "text-foreground" : "text-muted-foreground",
						)}
					>
						{isActive ? (
							<motion.span
								layoutId={layoutId}
								transition={shouldAnimate ? springs.snap : { duration: 0 }}
								className="absolute inset-0 -z-10 rounded-full bg-background shadow-sm"
							/>
						) : null}
						{option.label}
					</button>
				);
			})}
		</div>
	);
}
