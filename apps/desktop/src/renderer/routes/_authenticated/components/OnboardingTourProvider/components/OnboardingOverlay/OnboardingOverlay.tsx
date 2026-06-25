import { Button } from "@rox/ui/button";
import { Card } from "@rox/ui/card";
import { useEffect, useMemo, useState } from "react";

export interface OnboardingOverlayStep {
	id: string;
	anchor: string;
	title: string;
	body: string;
	action: string;
}

interface TargetRect {
	top: number;
	left: number;
	width: number;
	height: number;
}

interface OnboardingOverlayProps {
	step: OnboardingOverlayStep;
	stepIndex: number;
	totalSteps: number;
	onPause: () => void;
	onNext: () => void;
	onTargetAvailabilityChange?: (isAvailable: boolean) => void;
}

const CARD_WIDTH = 360;
const CARD_MARGIN = 16;

function escapeAnchorSelector(anchor: string) {
	if ("CSS" in window && typeof window.CSS.escape === "function") {
		return window.CSS.escape(anchor);
	}

	return anchor.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function findAnchorTarget(anchor: string) {
	const targets = Array.from(
		document.querySelectorAll<HTMLElement>(
			`[data-onboarding-anchor="${escapeAnchorSelector(anchor)}"]`,
		),
	);

	return (
		targets.find((target) => {
			const rect = target.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0;
		}) ?? null
	);
}

function getTargetRect(anchor: string): TargetRect | null {
	const target = findAnchorTarget(anchor);
	if (!target) {
		return null;
	}

	const rect = target.getBoundingClientRect();
	if (rect.width <= 0 || rect.height <= 0) {
		return null;
	}

	return {
		top: rect.top,
		left: rect.left,
		width: rect.width,
		height: rect.height,
	};
}

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

export function OnboardingOverlay({
	step,
	stepIndex,
	totalSteps,
	onPause,
	onNext,
	onTargetAvailabilityChange,
}: OnboardingOverlayProps) {
	const [targetRect, setTargetRect] = useState<TargetRect | null>(null);

	useEffect(() => {
		function updateTargetRect() {
			const nextRect = getTargetRect(step.anchor);
			setTargetRect(nextRect);
			onTargetAvailabilityChange?.(nextRect !== null);
		}

		updateTargetRect();
		window.addEventListener("resize", updateTargetRect);
		window.addEventListener("scroll", updateTargetRect, true);

		return () => {
			window.removeEventListener("resize", updateTargetRect);
			window.removeEventListener("scroll", updateTargetRect, true);
		};
	}, [onTargetAvailabilityChange, step.anchor]);

	const cardPosition = useMemo(() => {
		if (!targetRect) {
			return null;
		}

		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const preferredTop = targetRect.top + targetRect.height + CARD_MARGIN;
		const fallbackTop = targetRect.top - 220 - CARD_MARGIN;
		const top =
			preferredTop + 220 <= viewportHeight
				? preferredTop
				: Math.max(CARD_MARGIN, fallbackTop);

		return {
			top,
			left: clamp(
				targetRect.left,
				CARD_MARGIN,
				Math.max(CARD_MARGIN, viewportWidth - CARD_WIDTH - CARD_MARGIN),
			),
		};
	}, [targetRect]);

	if (!targetRect || !cardPosition) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-50">
			<div className="absolute inset-0 bg-black/60" />
			<div
				className="pointer-events-none absolute rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background"
				style={{
					top: targetRect.top - 6,
					left: targetRect.left - 6,
					width: targetRect.width + 12,
					height: targetRect.height + 12,
					boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.35)",
				}}
			/>
			<Card
				className="absolute gap-4 rounded-lg border-border/70 bg-popover p-4 text-popover-foreground shadow-2xl"
				style={{
					top: cardPosition.top,
					left: cardPosition.left,
					width: CARD_WIDTH,
				}}
			>
				<div className="space-y-2">
					<div className="text-xs font-medium text-muted-foreground">
						Шаг {stepIndex + 1} из {totalSteps}
					</div>
					<div className="text-base font-semibold leading-tight">
						{step.title}
					</div>
					<p className="text-sm leading-5 text-muted-foreground">{step.body}</p>
					<div className="rounded-md bg-muted px-3 py-2 text-sm">
						{step.action}
					</div>
				</div>
				<div className="flex items-center justify-end gap-2">
					<Button variant="ghost" size="sm" onClick={onPause}>
						Отложить
					</Button>
					<Button size="sm" onClick={onNext}>
						Дальше
					</Button>
				</div>
			</Card>
		</div>
	);
}
