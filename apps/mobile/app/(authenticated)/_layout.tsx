import { TabList, TabSlot, Tabs, TabTrigger } from "expo-router/ui";
import { View } from "react-native";
import { AppearanceBackground } from "@/components/appearance/AppearanceBackground";
import {
	CommandPaletteProvider,
	CommandPaletteSheet,
	CommandPaletteTrigger,
} from "@/components/commandPalette";
import { useDevicePresence } from "@/hooks/useDevicePresence";
import { AuthenticatedTabBar } from "@/screens/(authenticated)/components/AuthenticatedTabBar";
import { CollectionsProvider } from "@/screens/(authenticated)/providers/CollectionsProvider";

export default function AuthenticatedLayout() {
	useDevicePresence();

	return (
		<CollectionsProvider>
			<CommandPaletteProvider>
				<View style={{ flex: 1 }}>
					<AppearanceBackground />
					<Tabs>
						<TabSlot style={{ flex: 1 }} />
						<TabList style={{ display: "none" }}>
							<TabTrigger name="(home)" href="/(home)" />
							<TabTrigger name="(tasks)" href="/(tasks)" />
							<TabTrigger name="(more)" href="/(more)" />
						</TabList>
						<AuthenticatedTabBar />
					</Tabs>
					<CommandPaletteTrigger />
					<CommandPaletteSheet />
				</View>
			</CommandPaletteProvider>
		</CollectionsProvider>
	);
}
