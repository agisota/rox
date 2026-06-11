"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "../../lib/utils";
import { useTypefaceTheme } from "../TypefaceThemeProvider";
import { TYPEFACE_THEMES, type TypefaceTheme } from "../tokens";
import { useMotionTier } from "../useMotionTier";

const THEME_LABEL: Record<TypefaceTheme, string> = {
	blueprint: "Blueprint",
	brutalist: "Brutalist",
	docs: "Docs",
};

export interface TypefaceThemeSwitcherProps {
	className?: string;
	/** Accessible label for the radio group. */
	label?: string;
}

/**
 * Segmented control for the typeface theme — the persisted pill switcher from
 * the brief. Same construction as MotionTierSwitcher: visually-hidden native
 * radio inputs (true one-of-many semantics, arrow-key navigation), a
 * per-instance `useId` for the radio-group name and the highlight `layoutId`,
 * and the pill animates only when the motion governor allows transitions.
 */
export function TypefaceThemeSwitcher({
	className,
	label = "Typeface theme",
}: TypefaceThemeSwitcherProps) {
	const { theme, setTheme } = useTypefaceTheme();
	const { capabilities } = useMotionTier();
	const instanceId = useId();

	return (
		<fieldset
			className={cn(
				"inline-flex items-center gap-1 rounded-full border border-border bg-muted p-1",
				className,
			)}
		>
			<legend className="sr-only">{label}</legend>
			{TYPEFACE_THEMES.map((value) => {
				const selected = value === theme;
				return (
					<label
						className={cn(
							"relative cursor-pointer rounded-full px-3 py-1 text-xs",
							"has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
							selected
								? "text-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
						key={value}
					>
						<input
							checked={selected}
							className="sr-only"
							name={`typeface-theme-${instanceId}`}
							onChange={() => setTheme(value)}
							type="radio"
							value={value}
						/>
						{selected ? (
							capabilities.transition ? (
								<motion.span
									className="absolute inset-0 rounded-full bg-background shadow-sm"
									data-theme-pill
									layoutId={`typeface-theme-pill-${instanceId}`}
									transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
								/>
							) : (
								<span
									className="absolute inset-0 rounded-full bg-background shadow-sm"
									data-theme-pill
								/>
							)
						) : null}
						<span className="relative z-10">{THEME_LABEL[value]}</span>
					</label>
				);
			})}
		</fieldset>
	);
}
