import { Pressable, StyleSheet, Text } from "react-native";
import { useZenMode } from "./useZenModeStore";

/**
 * Mobile Focus / Zen mode toggle (F56, Hermes-borrow #649).
 *
 * A floating one-tap control that flips the shared zen state. While zen is
 * active the authenticated tab bar is hidden and the canvas (TabSlot) expands to
 * fill the screen; tapping again restores the chrome. Kept deliberately small
 * and self-contained, mirroring the F44 `CommandPaletteTrigger` placement.
 */
export function ZenModeTrigger() {
	const { isZen, toggleZen } = useZenMode();

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={isZen ? "Exit focus mode" : "Enter focus mode"}
			accessibilityState={{ selected: isZen }}
			onPress={toggleZen}
			style={[styles.button, isZen && styles.buttonActive]}
			hitSlop={8}
		>
			<Text style={styles.glyph}>{isZen ? "◳" : "◱"}</Text>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	button: {
		position: "absolute",
		right: 16,
		bottom: 96,
		width: 44,
		height: 44,
		borderRadius: 22,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0,0,0,0.55)",
	},
	buttonActive: {
		backgroundColor: "rgba(0,0,0,0.85)",
	},
	glyph: {
		color: "#fff",
		fontSize: 18,
	},
});
