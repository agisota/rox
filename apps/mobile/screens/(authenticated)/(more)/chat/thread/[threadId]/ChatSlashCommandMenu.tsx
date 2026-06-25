import {
	filterSlashMenu,
	getSlashMenuQuery,
	resolveLocalizedText,
	type SlashMenuEntry,
	type SlashMenuEntrySource,
} from "@rox/shared/command-palette";
import { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { NativeOnlyAnimatedView } from "@/components/ui/native-only-animated-view";
import { Text } from "@/components/ui/text";

/**
 * Mobile slash-command menu (F45) — an inline autocomplete rendered above the
 * chat composer when the draft is a single `/token`. DOM-free RN renderer over
 * the same shared matcher (`filterSlashMenu`) and built-in list that drive the
 * web/desktop menus, so all three hosts show the same commands with the same
 * source badges and locale-aware labels. Entrance animation is gated by
 * reduced-motion (reanimated `useReducedMotion`), mirroring `CommandPaletteSheet`.
 */

const SOURCE_BADGE_LABELS_RU: Record<SlashMenuEntrySource, string> = {
	builtin: "встроенная",
	"sub-arg": "параметр",
	agent: "агент",
	plugin: "плагин",
	skill: "навык",
	command: "команда",
};

export interface ChatSlashCommandMenuProps {
	/** The current composer draft. */
	draft: string;
	/** Available slash entries (typically the shared built-ins). */
	entries: SlashMenuEntry[];
	/** Apply a chosen command to the composer draft. */
	onSelect: (entry: SlashMenuEntry) => void;
	/** BCP-47 locale for labels/badges. Defaults to "ru". */
	locale?: string;
}

export function ChatSlashCommandMenu({
	draft,
	entries,
	onSelect,
	locale = "ru",
}: ChatSlashCommandMenuProps) {
	const reduceMotion = useReducedMotion();
	const query = getSlashMenuQuery(draft);

	const matches = useMemo(
		() =>
			query === null ? [] : filterSlashMenu(entries, query).map((m) => m.entry),
		[entries, query],
	);

	if (query === null || matches.length === 0) return null;

	const Container = reduceMotion ? View : NativeOnlyAnimatedView;

	return (
		<Container className="border-border bg-popover mb-2 max-h-56 overflow-hidden rounded-xl border">
			<ScrollView keyboardShouldPersistTaps="handled">
				{matches.map((entry) => (
					<Pressable
						key={entry.name}
						accessibilityRole="button"
						onPress={() => onSelect(entry)}
						className="active:bg-accent border-border/40 border-b px-3 py-2.5"
					>
						<View className="flex-row items-center gap-1.5">
							<Text className="font-medium">/{entry.name}</Text>
							<Text className="text-muted-foreground bg-muted/40 rounded-sm px-1 text-[10px] uppercase">
								{locale.split("-")[0] === "ru"
									? SOURCE_BADGE_LABELS_RU[entry.source]
									: entry.source}
							</Text>
							{entry.argumentHint ? (
								<Text className="text-muted-foreground text-xs">
									{entry.argumentHint}
								</Text>
							) : null}
						</View>
						<Text className="text-muted-foreground mt-0.5 text-xs">
							{resolveLocalizedText(entry.description, locale)}
						</Text>
					</Pressable>
				))}
			</ScrollView>
		</Container>
	);
}
