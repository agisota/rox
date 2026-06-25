import { motion } from "motion/react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "../../lib/utils";
import { ease, motionDuration, motionSpring } from "../../motion/tokens";
import { useShouldAnimate } from "../../motion/useMotionPreference";

/**
 * F57 (#650) — shared, AI-seedable empty-state primitive.
 *
 * One centered card that every surface (chat / drive / tab, web + desktop +
 * mobile) renders instead of hand-rolling its own empty view. Three slots:
 *   - a theme-tinted illustration (`icon`) that pops in,
 *   - a title + optional description,
 *   - 0–N seeded **action chips** that fade up one after another (staggered),
 *     each dispatching its `onSelect` (start a chat, open ⌘K, upload, …).
 *
 * Motion is gated on `useShouldAnimate("decorative")`: under reduced-motion the
 * card and every chip render in their final state instantly (no fade, no
 * stagger, no pop) — the gate is the single source of truth, mirroring every
 * other motion primitive in the kit.
 *
 * The primitive is intentionally network-free: chips are passed in by the call
 * site, which is where the suggestions endpoint (`suggestions.forSurface`) is
 * queried. That keeps `@rox/ui` free of tRPC and lets the same component back
 * the web/mobile surfaces over the identical shared endpoint.
 */

export interface EmptyStateChip {
	/** Stable identity for keys + dispatch. */
	id: string;
	/** Visible chip text (the seeded starter prompt / action label). */
	label: string;
	/** Optional leading glyph. */
	icon?: ReactNode;
	/** Fired when the chip is clicked — starts the action it represents. */
	onSelect: () => void;
}

export interface EmptyStateProps extends Omit<ComponentProps<"div">, "title"> {
	/** Theme-tinted illustration slot (lucide/react-icons glyph or artwork). */
	icon?: ReactNode;
	title: ReactNode;
	description?: ReactNode;
	/** Seeded action chips. Empty/omitted → no chip row is rendered. */
	chips?: EmptyStateChip[];
	/**
	 * Skeleton chips shown while suggestions load. When `true`, three muted
	 * placeholder pills render in the chip row instead of `chips`.
	 */
	chipsLoading?: boolean;
}

/** Per-chip entrance delay, in seconds. Matches `MenuItemReveal`'s cadence. */
const CHIP_STAGGER = 0.04;

/** Stable keys for the three loading-skeleton chips. */
const SKELETON_KEYS = ["s0", "s1", "s2"] as const;

export function EmptyState({
	icon,
	title,
	description,
	chips,
	chipsLoading = false,
	className,
	...props
}: EmptyStateProps) {
	const shouldAnimate = useShouldAnimate("decorative");
	const hasChipRow = chipsLoading || (chips?.length ?? 0) > 0;

	const cardMotion = shouldAnimate
		? {
				initial: { opacity: 0, y: 8, scale: 0.98 },
				animate: { opacity: 1, y: 0, scale: 1 },
				transition: motionSpring.bouncy,
			}
		: {};

	return (
		<div
			className={cn("flex flex-1 items-center justify-center p-6", className)}
			{...props}
		>
			<motion.div
				className="glass-panel flex max-w-sm flex-col items-center rounded-2xl border border-border/60 px-8 py-12 text-center"
				{...cardMotion}
			>
				{icon && (
					<div className="mb-4 text-primary [&>svg]:size-10">{icon}</div>
				)}
				<h3 className="font-medium text-foreground text-sm">{title}</h3>
				{description && (
					<p className="mt-1 max-w-xs text-muted-foreground text-xs">
						{description}
					</p>
				)}
				{hasChipRow && (
					<EmptyStateChips
						className="mt-5"
						chips={chips}
						chipsLoading={chipsLoading}
					/>
				)}
			</motion.div>
		</div>
	);
}

export interface EmptyStateChipsProps extends ComponentProps<"div"> {
	chips?: EmptyStateChip[];
	chipsLoading?: boolean;
}

/**
 * Standalone staggered chip row — the same seeded-action affordance the card
 * renders, exported so surfaces with their own bespoke layout (e.g. the tab
 * empty view's wordmark + hotkey grid) can append AI-seeded chips without
 * adopting the full card. Reuses the identical reduced-motion gate + stagger.
 */
export function EmptyStateChips({
	chips,
	chipsLoading = false,
	className,
	...props
}: EmptyStateChipsProps) {
	const shouldAnimate = useShouldAnimate("decorative");
	if (!chipsLoading && (chips?.length ?? 0) === 0) return null;

	return (
		<div
			className={cn(
				"flex flex-wrap items-center justify-center gap-2",
				className,
			)}
			{...props}
		>
			{chipsLoading
				? SKELETON_KEYS.map((key) => <EmptyStateChipSkeleton key={key} />)
				: chips?.map((chip, index) => (
						<EmptyStateChipButton
							key={chip.id}
							chip={chip}
							index={index}
							shouldAnimate={shouldAnimate}
						/>
					))}
		</div>
	);
}

interface EmptyStateChipButtonProps {
	chip: EmptyStateChip;
	index: number;
	shouldAnimate: boolean;
}

function EmptyStateChipButton({
	chip,
	index,
	shouldAnimate,
}: EmptyStateChipButtonProps) {
	const chipMotion = shouldAnimate
		? {
				initial: { opacity: 0, y: 6 },
				animate: { opacity: 1, y: 0 },
				transition: {
					duration: motionDuration.fast,
					delay: index * CHIP_STAGGER,
					ease: ease.standard as [number, number, number, number],
				},
			}
		: {};

	return (
		<motion.button
			type="button"
			onClick={chip.onSelect}
			className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 py-1.5 font-medium text-foreground text-xs transition-colors hover:border-primary/40 hover:bg-primary/10"
			{...chipMotion}
		>
			{chip.icon && (
				<span className="text-muted-foreground [&>svg]:size-3.5">
					{chip.icon}
				</span>
			)}
			{chip.label}
		</motion.button>
	);
}

function EmptyStateChipSkeleton() {
	return <span className="h-7 w-24 animate-pulse rounded-full bg-muted/60" />;
}
