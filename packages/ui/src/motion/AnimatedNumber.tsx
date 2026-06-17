import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";
import { motionSpring } from "./tokens";
import { useShouldAnimate } from "./useMotionPreference";

export interface AnimatedNumberProps {
	value: number;
	className?: string;
	/** Format the (possibly fractional, mid-animation) value into display text. */
	format?: (value: number) => string;
}

function defaultFormat(value: number): string {
	return Math.round(value).toString();
}

/**
 * Springs a number toward `value` and renders the interpolated result as text.
 * Renders the final value as plain text instantly when motion is disabled.
 */
export function AnimatedNumber({
	value,
	className,
	format,
}: AnimatedNumberProps) {
	const shouldAnimate = useShouldAnimate("essential");
	const motionValue = useMotionValue(value);
	const spring = useSpring(motionValue, motionSpring.soft);
	const display = useTransform(spring, (current) =>
		format ? format(current) : defaultFormat(current),
	);

	useEffect(() => {
		motionValue.set(value);
	}, [motionValue, value]);

	if (!shouldAnimate) {
		return (
			<span className={className}>
				{format ? format(value) : defaultFormat(value)}
			</span>
		);
	}

	return <motion.span className={className}>{display}</motion.span>;
}
