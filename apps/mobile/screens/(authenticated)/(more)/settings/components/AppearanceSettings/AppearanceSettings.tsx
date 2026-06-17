import { WALLPAPERS } from "@rox/shared/appearance";
import { Pressable, View } from "react-native";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { cn } from "@/lib/utils";
import { useAppearance } from "@/screens/RootLayout/providers/AppearanceProvider";

/** A labeled row with a trailing switch, used for each appearance toggle. */
function ToggleRow({
	label,
	description,
	value,
	onValueChange,
	disabled,
}: {
	label: string;
	description?: string;
	value: boolean;
	onValueChange: (next: boolean) => void;
	disabled?: boolean;
}) {
	return (
		<View className="flex-row items-center justify-between gap-4 py-2">
			<View className="flex-1">
				<Text className="font-medium">{label}</Text>
				{description ? (
					<Text className="text-muted-foreground text-sm">{description}</Text>
				) : null}
			</View>
			<Switch
				checked={value}
				onCheckedChange={onValueChange}
				disabled={disabled}
			/>
		</View>
	);
}

/** Stable position labels for the (fixed-length) swatch segments. */
const SWATCH_SLOTS = ["a", "b", "c", "d", "e"] as const;

/** Gradient swatch preview for a wallpaper in the selector grid. */
function WallpaperSwatch({ colors }: { colors: readonly string[] }) {
	return (
		<View className="h-12 w-full flex-row overflow-hidden rounded-md">
			{colors.map((color, index) => (
				<View
					// Segments are positional and never reordered; key by fixed slot so
					// duplicate colors (e.g. matching first/last stops) stay distinct.
					key={SWATCH_SLOTS[index] ?? color}
					style={{ backgroundColor: color }}
					className="flex-1"
				/>
			))}
		</View>
	);
}

/**
 * Local appearance settings card: wallpaper on/off, a wallpaper selector,
 * auto-rotate, and the quote loading screen toggle. Reads and writes the
 * AppearanceProvider context (persisted to AsyncStorage).
 *
 * Glass/blur is intentionally omitted on mobile for this slice (the available
 * `expo-glass-effect` is a native view wrapper, not a backdrop-blur primitive
 * the shared `glassEnabled`/`windowOpacity` settings map onto cleanly).
 */
export function AppearanceSettings() {
	const { settings, updateSettings } = useAppearance();
	const wallpaperEnabled = settings.wallpaperId !== null;

	const handleWallpaperEnabledChange = (enabled: boolean) => {
		updateSettings({
			wallpaperId: enabled ? (WALLPAPERS[0]?.id ?? null) : null,
		});
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Appearance</CardTitle>
			</CardHeader>
			<CardContent className="gap-2">
				<ToggleRow
					label="Wallpaper background"
					description="Show a gradient wallpaper behind the app."
					value={wallpaperEnabled}
					onValueChange={handleWallpaperEnabledChange}
				/>

				{wallpaperEnabled ? (
					<View className="gap-3 py-2">
						<View className="flex-row flex-wrap gap-3">
							{WALLPAPERS.map((wallpaper) => {
								const selected = wallpaper.id === settings.wallpaperId;
								const colors =
									wallpaper.source.kind === "gradient"
										? wallpaper.source.colors
										: ["#000000"];
								return (
									<Pressable
										key={wallpaper.id}
										onPress={() =>
											updateSettings({ wallpaperId: wallpaper.id })
										}
										className={cn(
											"w-[47%] gap-1 rounded-lg border p-2",
											selected ? "border-primary" : "border-border",
										)}
									>
										<WallpaperSwatch colors={colors} />
										<Text className="text-sm">{wallpaper.name}</Text>
									</Pressable>
								);
							})}
						</View>

						<ToggleRow
							label="Auto-rotate"
							description="Switch wallpapers automatically over time."
							value={settings.wallpaperAutoRotate}
							onValueChange={(next) =>
								updateSettings({ wallpaperAutoRotate: next })
							}
						/>
					</View>
				) : null}

				<ToggleRow
					label="Quote loading screen"
					description="Show a motivational quote while the app loads."
					value={settings.quoteLoaderEnabled}
					onValueChange={(next) => updateSettings({ quoteLoaderEnabled: next })}
				/>
			</CardContent>
		</Card>
	);
}
