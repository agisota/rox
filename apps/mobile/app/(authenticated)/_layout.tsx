import { TabList, TabSlot, Tabs, TabTrigger } from "expo-router/ui";
import { View } from "react-native";
import { AppearanceBackground } from "@/components/appearance/AppearanceBackground";
import {
	CommandPaletteProvider,
	CommandPaletteSheet,
	CommandPaletteTrigger,
} from "@/components/commandPalette";
import {
	useZenMode,
	ZenModeProvider,
	ZenModeTrigger,
} from "@/components/zenMode";
import { useDevicePresence } from "@/hooks/useDevicePresence";
import { AuthenticatedTabBar } from "@/screens/(authenticated)/components/AuthenticatedTabBar";
import { CollectionsProvider } from "@/screens/(authenticated)/providers/CollectionsProvider";

/**
 * Inner shell — reads the shared Focus / Zen mode state (F56, #649). When zen is
 * active the tab bar (mobile's rail/drawer) is hidden so the canvas (TabSlot)
 * fills the screen; the floating trigger flips it back. Must live under the
 * `ZenModeProvider` so the hook has a store to bind to.
 */
function AuthenticatedShell() {
	const { isZen } = useZenMode();

	return (
		<View style={{ flex: 1 }}>
			<AppearanceBackground />
			<Tabs>
				<TabSlot style={{ flex: 1 }} />
				<TabList style={{ display: "none" }}>
					<TabTrigger name="(home)" href="/(home)" />
					<TabTrigger name="(tasks)" href="/(tasks)" />
					<TabTrigger name="(more)" href="/(more)" />
				</TabList>
				{!isZen && <AuthenticatedTabBar />}
			</Tabs>
			<ZenModeTrigger />
			{!isZen && <CommandPaletteTrigger />}
			<CommandPaletteSheet />
		</View>
	);
}

export default function AuthenticatedLayout() {
	useDevicePresence();

	return (
		<CollectionsProvider>
			<CommandPaletteProvider>
				<ZenModeProvider>
					<AuthenticatedShell />
				</ZenModeProvider>
			</CommandPaletteProvider>
		</CollectionsProvider>
	);
}
