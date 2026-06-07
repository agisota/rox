import { motion, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";
import { springs } from "../tokens";
import { useMotionPreference } from "../useMotionPreference";

export interface AnimatedNumberProps {
	value: number;
	/** Format the (rounded) display value. Defaults to a locale integer. */
	format?: (value: number) => string;
	className?: string;
}

const defaultFormat = (value: number) => Math.round(value).toLocaleString();

/**
 * Springs a number toward its target (count-up). Initialised at the first
 * value, so there is no surprise count-up on mount — only subsequent changes
 * animate. Under disabled motion the exact value is rendered immediately.
 *
 * Used for: badge counts (PR-09), resource consumption (PR-11).
 */
export function AnimatedNumber({
	value,
	format = defaultFormat,
	className,
}: AnimatedNumberProps) {
	const { disabled } = useMotionPreference();
	const spring = useSpring(value, springs.soft);
	const display = useTransform(spring, (latest) => format(latest));

	useEffect(() => {
		spring.set(value);
	}, [spring, value]);

	if (disabled) {
		return <span className={className}>{format(value)}</span>;
	}

	return <motion.span className={className}>{display}</motion.span>;
}
