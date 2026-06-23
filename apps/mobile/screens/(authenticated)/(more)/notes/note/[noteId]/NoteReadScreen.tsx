import { useLocalSearchParams, useRouter } from "expo-router";
import { Globe, Pencil } from "lucide-react-native";
import { useCallback } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { MarkdownView } from "./components/MarkdownView";
import { useNote } from "./hooks/useNote";

export function NoteReadScreen() {
	const { noteId } = useLocalSearchParams<{ noteId: string }>();
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { note, isLoading, error } = useNote(noteId);

	const handleEdit = useCallback(() => {
		if (!noteId) return;
		router.push({
			pathname: "/(authenticated)/(more)/notes/note-edit",
			params: { noteId },
		});
	}, [noteId, router]);

	const tags = note?.tags ?? [];

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
						<View className="flex-row items-start justify-between gap-3">
							<Text className="flex-1 text-2xl font-bold">{note.title}</Text>
							<Pressable
								accessibilityRole="button"
								accessibilityLabel="Edit note"
								onPress={handleEdit}
								className="size-10 items-center justify-center rounded-full border border-border active:opacity-70"
							>
								<Icon as={Pencil} className="size-5 text-foreground" />
							</Pressable>
						</View>

						{note.isPublished || tags.length > 0 ? (
							<View className="flex-row flex-wrap items-center gap-2">
								{note.isPublished ? (
									<Badge variant="secondary">
										<Icon as={Globe} className="size-3" />
										<Text>Public</Text>
									</Badge>
								) : null}
								{tags.map((tag) => (
									<Badge key={tag} variant="outline">
										<Text>{tag}</Text>
									</Badge>
								))}
							</View>
						) : null}

						<MarkdownView markdown={note.markdown} />
					</>
				)}
			</View>
		</ScrollView>
	);
}
