import {
	executeCommand,
	matchCommands,
	type Command as PaletteCommand,
	resolveActiveCommands,
} from "@rox/shared/command-palette";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Input } from "@/components/ui/input";
import { NativeOnlyAnimatedView } from "@/components/ui/native-only-animated-view";
import { Text } from "@/components/ui/text";
import {
	MOBILE_SECTION_LABELS,
	MOBILE_SECTION_ORDER,
	type MobileCommandContext,
} from "./context";
import { mobileCommandProviders } from "./providers";
import { useCommandPalette } from "./useCommandPaletteStore";

/**
 * Mobile ⌘K command palette — a RN bottom-sheet renderer (DOM-free, no `cmdk`)
 * over the same shared provider registry, matcher and execute pipeline as
 * desktop/web (`@rox/shared/command-palette`). Supports the shared scope-prefix
 * grammar (`>` commands · `#` tags · `@` profiles · `/` files) and fuzzy search.
 *
 * Sheet entrance animation is gated by reduced-motion (reanimated
 * `useReducedMotion`) per the F44 acceptance criteria.
 */
export function CommandPaletteSheet() {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const reduceMotion = useReducedMotion();
	const { open, setOpen } = useCommandPalette();
	const [query, setQuery] = useState("");

	const context = useMemo<MobileCommandContext>(
		() => ({ navigate: (href) => router.push(href) }),
		[router],
	);

	const sections = useMemo(
		() =>
			resolveActiveCommands(mobileCommandProviders, context, {
				order: MOBILE_SECTION_ORDER,
				labels: MOBILE_SECTION_LABELS,
			}),
		[context],
	);

	const matchedSections = useMemo(
		() =>
			sections
				.map((section) => ({
					...section,
					results: matchCommands(section.commands, query),
				}))
				.filter((section) => section.results.length > 0),
		[sections, query],
	);

	const onSelect = useCallback(
		async (command: PaletteCommand<MobileCommandContext>) => {
			setOpen(false);
			setQuery("");
			await executeCommand(command, context, {
				notifyInfo: (message) => Alert.alert(message),
				notifyError: (message) => Alert.alert("Ошибка", message),
			});
		},
		[context, setOpen],
	);

	return (
		<Modal
			visible={open}
			transparent
			animationType={reduceMotion ? "none" : "slide"}
			onRequestClose={() => setOpen(false)}
		>
			<Pressable
				className="flex-1 justify-end bg-black/50"
				onPress={() => setOpen(false)}
			>
				<Pressable
					className="bg-popover max-h-[80%] rounded-t-2xl border-t border-border"
					style={{ paddingBottom: insets.bottom }}
					onPress={(event) => event.stopPropagation()}
				>
					<NativeOnlyAnimatedView className="p-4">
						<View className="mb-3 h-1 w-10 self-center rounded-full bg-border" />
						<Input
							value={query}
							onChangeText={setQuery}
							autoFocus
							placeholder="Поиск… (> команды · # теги · @ профили · / файлы)"
						/>
						<ScrollView className="mt-3" keyboardShouldPersistTaps="handled">
							{matchedSections.length === 0 ? (
								<Text className="text-muted-foreground py-6 text-center">
									Ничего не найдено.
								</Text>
							) : (
								matchedSections.map((section) => (
									<View key={section.id} className="mb-2">
										<Text className="text-muted-foreground px-1 py-1.5 text-xs font-medium">
											{section.label}
										</Text>
										{section.results.map(({ command }) => (
											<Pressable
												key={command.id}
												disabled={command.disabled}
												onPress={() => void onSelect(command)}
												className="active:bg-accent rounded-md px-2 py-3"
											>
												<Text
													className={
														command.disabled ? "text-muted-foreground" : ""
													}
												>
													{command.title}
												</Text>
											</Pressable>
										))}
									</View>
								))
							)}
						</ScrollView>
					</NativeOnlyAnimatedView>
				</Pressable>
			</Pressable>
		</Modal>
	);
}
