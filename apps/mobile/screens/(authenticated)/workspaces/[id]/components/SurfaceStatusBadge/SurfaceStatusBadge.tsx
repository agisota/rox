import type { WorkspaceSurfaceStatus } from "@rox/shared/workspace-status";
import { useEffect } from "react";
import Animated, {
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withRepeat,
	withTiming,
} from "react-native-reanimated";
import { Badge } from "@/components/ui/badge";
import { Text } from "@/components/ui/text";
import { surfaceStatusPresentation } from "./surfaceStatusPresentation";

interface SurfaceStatusBadgeProps {
	status: WorkspaceSurfaceStatus;
}

/**
 * Status badge for a workspace Claude session / terminal card (FN-016). Maps the
 * shared surface status to a labelled, optionally-pulsing badge. The pulse is
 * suppressed when the OS requests reduced motion, and only `live`/`connecting`
 * pulse at all (per {@link surfaceStatusPresentation}).
 */
export function SurfaceStatusBadge({ status }: SurfaceStatusBadgeProps) {
	const { label, variant, pulse } = surfaceStatusPresentation(status);
	const reduceMotion = useReducedMotion();
	const opacity = useSharedValue(1);
	const shouldPulse = pulse && !reduceMotion;

	useEffect(() => {
		if (shouldPulse) {
			opacity.value = withRepeat(withTiming(0.45, { duration: 900 }), -1, true);
		} else {
			opacity.value = withTiming(1, { duration: 150 });
		}
	}, [shouldPulse, opacity]);

	const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

	return (
		<Animated.View style={animatedStyle}>
			<Badge variant={variant}>
				<Text>{label}</Text>
			</Badge>
		</Animated.View>
	);
}
