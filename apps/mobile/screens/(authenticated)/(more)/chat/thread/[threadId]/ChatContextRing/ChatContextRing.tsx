import { useMemo } from "react";
import { View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { Text } from "@/components/ui/text";

const ICON_SIZE = 20;
const VIEWBOX = 24;
const CENTER = 12;
const RADIUS = 10;
const STROKE_WIDTH = 2;

export interface ChatContextRingProps {
	/** Estimated tokens currently occupying the context window. */
	usedTokens: number;
	/** The model's context window in tokens. */
	maxTokens: number;
}

/**
 * Mobile (React Native) equivalent of the web/desktop composer context-usage
 * ring (Hermes-borrow F42). Renders the same donut + percentage from the same
 * shared `@rox/shared/context-usage` inputs the other surfaces use, so all three
 * platforms report identical usage for the same conversation + model. Drawn with
 * `react-native-svg` (the DOM `Context` primitive can't run in RN). The fill is
 * static when the user prefers reduced motion.
 */
export function ChatContextRing({
	usedTokens,
	maxTokens,
}: ChatContextRingProps) {
	const reduceMotion = useReducedMotion();
	const { usedPercent, dashOffset, circumference } = useMemo(() => {
		const ratio = maxTokens > 0 ? Math.min(usedTokens / maxTokens, 1) : 0;
		const circ = 2 * Math.PI * RADIUS;
		return {
			usedPercent: ratio,
			circumference: circ,
			dashOffset: circ * (1 - ratio),
		};
	}, [usedTokens, maxTokens]);

	const label = useMemo(
		() =>
			new Intl.NumberFormat("ru-RU", {
				style: "percent",
				maximumFractionDigits: 1,
			}).format(usedPercent),
		[usedPercent],
	);

	// `reduceMotion` is intentionally read so the value is part of render; RN SVG
	// has no fill transition to gate, so the ring is always static — honoring the
	// preference by never animating, matching the reduced-motion branch on web.
	void reduceMotion;

	return (
		<View
			accessibilityRole="image"
			accessibilityLabel={`Использование контекста модели: ${label}`}
			className="flex-row items-center gap-1"
		>
			<Text className="text-xs text-muted-foreground">{label}</Text>
			<Svg
				width={ICON_SIZE}
				height={ICON_SIZE}
				viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
			>
				<Circle
					cx={CENTER}
					cy={CENTER}
					r={RADIUS}
					fill="none"
					stroke="currentColor"
					strokeWidth={STROKE_WIDTH}
					opacity={0.25}
				/>
				<Circle
					cx={CENTER}
					cy={CENTER}
					r={RADIUS}
					fill="none"
					stroke="currentColor"
					strokeWidth={STROKE_WIDTH}
					strokeLinecap="round"
					strokeDasharray={`${circumference} ${circumference}`}
					strokeDashoffset={dashOffset}
					opacity={0.7}
					transform={`rotate(-90 ${CENTER} ${CENTER})`}
				/>
			</Svg>
		</View>
	);
}
