import { cn } from "@rox/ui/utils";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

interface DefaultHeaderContentProps {
	title: ReactNode;
	icon?: ReactNode;
	/**
	 * Stable discriminator for the pane "type badge" icon (e.g. the pane kind:
	 * 'terminal' | 'chat' | 'browser' | 'file'). When provided (and motion is
	 * enabled) the icon span crossfades on change via AnimatePresence; when
	 * absent it renders statically, preserving the original instant behavior.
	 */
	iconKey?: string;
	isActive: boolean;
	titleContent?: ReactNode;
	headerExtras?: ReactNode;
	actionsContent: ReactNode;
}

export function DefaultHeaderContent({
	title,
	icon,
	iconKey,
	isActive,
	titleContent,
	headerExtras,
	actionsContent,
}: DefaultHeaderContentProps) {
	// panes cannot import the apps/desktop motion foundation; honor reduced
	// motion via framer-motion's own hook. shouldAnimate = !reduce.
	const shouldAnimate = !useReducedMotion();
	return (
		<div className="flex h-full w-full min-w-0 items-center gap-2 px-3">
			<div className="flex min-w-0 flex-1 items-center gap-2">
				{titleContent ?? (
					<>
						{icon &&
							(shouldAnimate && iconKey ? (
								<span className="relative grid h-4 w-4 shrink-0 place-items-center">
									<AnimatePresence initial={false} mode="popLayout">
										<motion.span
											key={iconKey}
											className="absolute inset-0 grid place-items-center"
											initial={{ opacity: 0, scale: 0.85 }}
											animate={{ opacity: 1, scale: 1 }}
											exit={{ opacity: 0, scale: 0.85 }}
											transition={{ duration: 0.12 }}
										>
											{icon}
										</motion.span>
									</AnimatePresence>
								</span>
							) : (
								<span className="shrink-0">{icon}</span>
							))}
						<span
							className={cn(
								"truncate text-xs transition-colors duration-150",
								isActive ? "text-foreground" : "text-muted-foreground",
							)}
							title={typeof title === "string" ? title : undefined}
						>
							{title}
						</span>
					</>
				)}
			</div>
			{/* biome-ignore lint/a11y/noStaticElementInteractions: stop drag from starting on action buttons */}
			<div
				className="flex shrink-0 items-center gap-0.5"
				onMouseDown={(e) => e.stopPropagation()}
			>
				{headerExtras}
				{actionsContent}
			</div>
		</div>
	);
}
