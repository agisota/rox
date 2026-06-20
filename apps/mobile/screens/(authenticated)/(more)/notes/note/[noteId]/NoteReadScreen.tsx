import { useLocalSearchParams } from "expo-router";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { MarkdownView } from "./components/MarkdownView";
import { useNote } from "./hooks/useNote";

export function NoteReadScreen() {
	const { noteId } = useLocalSearchParams<{ noteId: string }>();
	const insets = useSafeAreaInsets();
	const { note, isLoading, error } = useNote(noteId);

	return (
		<ScrollView
			className="flex-1 bg-background"
			contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 48 }}
		>
			<View className="gap-4 p-6">
				{error ? (
					<View className="items-center justify-center py-20">
						<Text className="text-center text-destructive">{error}</Text>
					</View>
				) : !note ? (
					isLoading ? (
						<View className="gap-3">
							<Skeleton className="h-7 w-2/3" />
							<Skeleton className="h-5 w-full" />
							<Skeleton className="h-5 w-5/6" />
							<Skeleton className="h-5 w-4/6" />
						</View>
					) : (
						<View className="items-center justify-center py-20">
							<Text className="text-center text-muted-foreground">
								Note not found.
							</Text>
						</View>
					)
				) : (
					<>
						<Text className="text-2xl font-bold">{note.title}</Text>
						<MarkdownView markdown={note.markdown} />
					</>
				)}
			</View>
		</ScrollView>
	);
}
