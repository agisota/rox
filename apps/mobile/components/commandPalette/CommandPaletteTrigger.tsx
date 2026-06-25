import { Command as CommandIcon } from "lucide-react-native";
import { Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "@/components/ui/icon";
import { useCommandPalette } from "./useCommandPaletteStore";

/**
 * Floating action button that opens the command palette — the mobile analogue
 * of the desktop ⌘K accelerator. Tap or long-press both summon the palette.
 */
export function CommandPaletteTrigger() {
	const insets = useSafeAreaInsets();
	const { setOpen } = useCommandPalette();

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel="Открыть командную палитру"
			onPress={() => setOpen(true)}
			onLongPress={() => setOpen(true)}
			className="bg-primary active:opacity-80 absolute right-5 size-14 items-center justify-center rounded-full shadow-lg shadow-black/20"
			style={{ bottom: insets.bottom + 80 }}
		>
			<Icon as={CommandIcon} className="text-primary-foreground size-6" />
		</Pressable>
	);
}
