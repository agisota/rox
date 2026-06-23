import { useLocalSearchParams, useRouter } from "expo-router";
import { Globe, Share2 } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Alert, ScrollView, Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { formatTags, parseTags } from "../../../utils/parseTags";
import { useNote } from "../hooks/useNote";
import { useNoteEditor } from "../hooks/useNoteEditor";

export function NoteEditScreen() {
	const { noteId } = useLocalSearchParams<{ noteId: string }>();
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { note, isLoading, error } = useNote(noteId);
	const {
		saving,
		publishing,
		error: editorError,
		save,
		setPublished,
	} = useNoteEditor(noteId);

	const [title, setTitle] = useState("");
	const [markdown, setMarkdown] = useState("");
	const [tagsField, setTagsField] = useState("");
	const [isPublished, setIsPublished] = useState(false);
	const [publicUrl, setPublicUrl] = useState<string | null>(null);
	const [hydrated, setHydrated] = useState(false);

	// Seed the editor from the loaded note exactly once (cache-first: we render
	// existing data immediately, but only hydrate local edit state on first load
	// so we never clobber in-progress edits on a background refetch).
	useEffect(() => {
		if (!note || hydrated) return;
		setTitle(note.title);
		setMarkdown(note.markdown);
		setTagsField(formatTags(note.tags ?? []));
		setIsPublished(note.isPublished);
		setPublicUrl(note.publicUrl ?? null);
		setHydrated(true);
	}, [note, hydrated]);

	const handleSave = useCallback(async () => {
		const ok = await save({
			title,
			markdown,
			tags: parseTags(tagsField),
		});
		if (ok) router.back();
	}, [save, title, markdown, tagsField, router]);

	const handleTogglePublish = useCallback(
		async (next: boolean) => {
			setIsPublished(next);
			const updated = await setPublished(next);
			if (updated) {
				setPublicUrl(updated.publicUrl ?? null);
			} else {
				// Revert the optimistic switch on failure.
				setIsPublished(!next);
			}
		},
		[setPublished],
	);

	const handleShareLink = useCallback(async () => {
		if (!publicUrl) return;
		try {
			await Share.share({ message: publicUrl, url: publicUrl });
		} catch {
			Alert.alert("Could not share", "Please try again.");
		}
	}, [publicUrl]);

	return (
		<ScrollView
			className="flex-1 bg-background"
			contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 48 }}
			keyboardShouldPersistTaps="handled"
		>
			<View className="gap-4 p-6">
				{error ? (
					<View className="items-center justify-center py-20">
						<Text className="text-center text-destructive">{error}</Text>
					</View>
				) : !note ? (
					isLoading ? (
						<View className="gap-3">
							<Skeleton className="h-12 w-full" />
							<Skeleton className="h-40 w-full" />
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
						<View className="gap-1.5">
							<Label>Title</Label>
							<Input
								value={title}
								onChangeText={setTitle}
								placeholder="Note title"
							/>
						</View>

						<View className="gap-1.5">
							<Label>Content (Markdown)</Label>
							<Textarea
								value={markdown}
								onChangeText={setMarkdown}
								placeholder="Write your note in markdown…"
								multiline
								numberOfLines={12}
								className="min-h-48"
								textAlignVertical="top"
							/>
						</View>

						<View className="gap-1.5">
							<Label>Tags</Label>
							<Input
								value={tagsField}
								onChangeText={setTagsField}
								placeholder="comma, separated, tags"
								autoCapitalize="none"
							/>
						</View>

						<Card>
							<CardHeader>
								<View className="flex-row items-center gap-2">
									<Icon as={Globe} className="size-5 text-foreground" />
									<CardTitle>Public link</CardTitle>
								</View>
							</CardHeader>
							<CardContent className="gap-3">
								<View className="flex-row items-center justify-between">
									<Text className="flex-1 text-muted-foreground">
										{isPublished
											? "Anyone with the link can read this note."
											: "Publish to share a public read-only link."}
									</Text>
									<Switch
										checked={isPublished}
										onCheckedChange={handleTogglePublish}
										disabled={publishing}
									/>
								</View>
								{isPublished && publicUrl ? (
									<View className="gap-2">
										<Text
											className="text-xs text-muted-foreground"
											numberOfLines={1}
										>
											{publicUrl}
										</Text>
										<Button
											size="sm"
											variant="outline"
											onPress={handleShareLink}
										>
											<Icon as={Share2} className="size-4" />
											<Text>Share link</Text>
										</Button>
									</View>
								) : null}
							</CardContent>
						</Card>

						{editorError ? (
							<Text className="text-sm text-destructive">{editorError}</Text>
						) : null}

						<Button onPress={handleSave} disabled={saving}>
							<Text>{saving ? "Saving…" : "Save note"}</Text>
						</Button>
					</>
				)}
			</View>
		</ScrollView>
	);
}
