"use client";

/**
 * OnboardingWizardShell — the cross-platform onboarding wizard chrome (F48, #637).
 *
 * The DOM presentational shell for web + desktop. It renders the step header
 * (title / subtitle), the {@link PaginationDots} progress, a slot for the step
 * body (`children`), and the footer nav (Back / Continue / optional Skip). It is
 * purely prop-driven: the *logic* (which step is current, whether Continue is
 * gated) lives in the neutral `@rox/shared/wizard` reducer the host owns; this
 * component only lays out the result and animates step transitions.
 *
 * Motion mirrors the original desktop `layout.tsx`: the body cross-fades via
 * `AnimatePresence` keyed on the step index, gated by `useShouldAnimate`
 * ("essential" for the step swap). Reduced-motion snaps instead of springing.
 *
 * Mobile does NOT use this (it cannot import DOM / framer-motion); it renders
 * its own RN host over the same neutral nav + probe state.
 */

import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

import { cn } from "../../lib/utils";
import { motionDuration } from "../../motion/tokens";
import { useShouldAnimate } from "../../motion/useMotionPreference";
import { Button } from "../ui/button";
import { PaginationDots } from "./PaginationDots";

export interface OnboardingWizardShellProps {
	/** Zero-based index of the active step (drives dots + transition key). */
	currentStep: number;
	/** Total number of steps. */
	totalSteps: number;
	/** Active step heading. */
	title: string;
	/** Optional supporting line under the heading. */
	subtitle?: string;
	/** The step body. */
	children: ReactNode;
	/** Back handler; `null` hides Back (e.g. on the first step). */
	onBack?: (() => void) | null;
	/** Continue handler; `null` hides Continue (e.g. host finalizes the step). */
	onContinue?: (() => void) | null;
	/** Disables Continue (e.g. probe gate not yet satisfied). */
	continueDisabled?: boolean;
	/** Skip handler; `null` hides Skip. */
	onSkip?: (() => void) | null;
	/** Disables Skip while a skip is in flight. */
	skipDisabled?: boolean;
	/** Continue button label (host-localized). */
	continueLabel?: string;
	/** Back button label (host-localized). */
	backLabel?: string;
	/** Skip button label (host-localized). */
	skipLabel?: string;
	/** Optional extra content in the footer's leading slot (e.g. a help button). */
	footerLeading?: ReactNode;
	className?: string;
}

export function OnboardingWizardShell({
	currentStep,
	totalSteps,
	title,
	subtitle,
	children,
	onBack,
	onContinue,
	continueDisabled,
	onSkip,
	skipDisabled,
	continueLabel = "Продолжить",
	backLabel = "Назад",
	skipLabel = "Пропустить пока",
	footerLeading,
	className,
}: OnboardingWizardShellProps) {
	const shouldAnimate = useShouldAnimate("essential");

	return (
		<div
			className={cn("flex h-full w-full flex-col", className)}
			data-slot="onboarding-wizard-shell"
		>
			<div className="flex-1 overflow-auto">
				<div className="mx-auto flex w-full max-w-2xl flex-col px-8 pt-16 pb-6">
					<AnimatePresence mode="wait" initial={false}>
						<motion.div
							key={currentStep}
							className="flex flex-col gap-10"
							initial={shouldAnimate ? { opacity: 0, y: 8 } : false}
							animate={{ opacity: 1, y: 0 }}
							exit={shouldAnimate ? { opacity: 0, y: -8 } : undefined}
							transition={{ duration: motionDuration.fast }}
						>
							<div className="space-y-2">
								<h1 className="text-2xl font-semibold text-foreground">
									{title}
								</h1>
								{subtitle ? (
									<p className="text-sm text-muted-foreground">{subtitle}</p>
								) : null}
							</div>
							{children}
						</motion.div>
					</AnimatePresence>
				</div>
			</div>

			<div className="border-t border-border" data-slot="wizard-footer">
				<div className="mx-auto flex w-full max-w-2xl items-center gap-4 px-8 py-4">
					<div className="flex flex-1 items-center justify-start gap-1">
						{onBack ? (
							<Button size="sm" variant="ghost" onClick={onBack}>
								{backLabel}
							</Button>
						) : null}
						{footerLeading}
					</div>

					<PaginationDots current={currentStep} total={totalSteps} />

					<div className="flex flex-1 items-center justify-end gap-2">
						{onSkip ? (
							<Button
								size="sm"
								variant="ghost"
								className="text-muted-foreground"
								onClick={onSkip}
								disabled={skipDisabled}
							>
								{skipLabel}
							</Button>
						) : null}
						{onContinue ? (
							<Button
								size="sm"
								onClick={onContinue}
								disabled={continueDisabled}
							>
								{continueLabel}
							</Button>
						) : null}
					</div>
				</div>
			</div>
		</div>
	);
}
