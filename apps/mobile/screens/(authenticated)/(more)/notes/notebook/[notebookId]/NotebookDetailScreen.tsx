import { useLocalSearchParams, useRouter } from "expo-router";
import { FileText, Plus } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { collectTags, toggleTag } from "../../utils/parseTags";
import { useNotes } from "./hooks/useNotes";

function formatDate(value: Date | string | null): string | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString();
}

export function NotebookDetailScreen() {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { notebookId } = useLocalSearchParams<{
		notebookId: string;
		name?: string;
	}>();
	const { notes, isLoading, error, creating, createNote, refresh } =
		useNotes(notebookId);
	const [refreshing, setRefreshing] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const [title, setTitle] = useState("");
	const [activeTags, setActiveTags] = useState<string[]>([]);

	const availableTags = useMemo(
		() => collectTags(notes.map((n) => n.tags)),
		[notes],
	);

	const visibleNotes = useMemo(() => {
		if (activeTags.length === 0) return notes;
		const wanted = activeTags.map((t) => t.toLowerCase());
		return notes.filter((note) => {
			const noteTags = (note.tags ?? []).map((t) => t.toLowerCase());
			return wanted.every((t) => noteTags.includes(t));
		});
	}, [notes, activeTags]);

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await refresh();
		setRefreshing(false);
	}, [refresh]);

	const handleOpen = useCallback(
		(noteId: string) => {
			router.push({
				pathname: "/(authenticated)/(more)/notes/note",
				params: { noteId },
			});
		},
		[router],
	);

	const handleCreate = useCallback(async () => {
		const newId = await createNote(title);
		if (newId) {
			setTitle("");
			setCreateOpen(false);
			handleOpen(newId);
		}
	}, [title, createNote, handleOpen]);

	const hasData = notes.length > 0;
	const hasVisible = visibleNotes.length > 0;

	let content: React.ReactNode;
	if (error) {
		content = (
			<View className="items-center justify-center py-20">
				<Text className="text-center text-destructive">{error}</Text>
			</View>
		);
	} else if (!hasData && isLoading) {
		content = (
			<View className="gap-3 p-4">
				<Skeleton className="h-12 w-full" />
				<Skeleton className="h-12 w-full" />
			</View>
		);
	} else if (!hasData) {
		content = (
			<View className="items-center justify-center py-20">
				<Text className="text-center text-muted-foreground">
					No notes yet. Tap + to write one.
				</Text>
			</View>
		);
	} else if (!hasVisible) {
		content = (
			<View className="items-center justify-center py-20">
				<Text className="text-center text-muted-foreground">
					No notes match the selected tags.
				</Text>
			</View>
		);
	} else {
		content = (
			<View>
				{visibleNotes.map((note, index) => {
					const updated = formatDate(note.updatedAt);
					return (
						<View key={note.id}>
							{index > 0 ? <Separator /> : null}
							<Pressable
								onPress={() => handleOpen(note.id)}
								className="flex-row items-center gap-3 px-4 py-3 active:opacity-70"
							>
								<Icon as={FileText} className="size-5 text-muted-foreground" />
								<View className="flex-1">
									<Text className="text-base font-medium" numberOfLines={1}>
										{note.title}
									</Text>
									{updated ? (
										<Text className="text-xs text-muted-foreground">
											Updated {updated}
										</Text>
									) : null}
								</View>
							</Pressable>
						</View>
					);
				})}
			</View>
		);
	}

	return (
		<View className="flex-1 bg-background">
			<ScrollView
				className="flex-1"
				contentInsetAdjustmentBehavior="automatic"
				contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
				refreshControl={
					<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
				}
			>
				{availableTags.length > 0 ? (
					<View className="flex-row flex-wrap gap-2 px-4 pb-1 pt-3">
						{availableTags.map((tag) => {
							const active = activeTags.some(
								(t) => t.toLowerCase() === tag.toLowerCase(),
							);
							return (
								<Pressable
									key={tag}
									onPress={() => setActiveTags((prev) => toggleTag(prev, tag))}
									className={`rounded-full border px-3 py-1 active:opacity-70 ${
										active
											? "border-primary bg-primary"
											: "border-border bg-background"
									}`}
								>
									<Text
										className={
											active
												? "text-xs font-medium text-primary-foreground"
												: "text-xs text-muted-foreground"
										}
									>
										{tag}
									</Text>
								</Pressable>
							);
						})}
					</View>
				) : null}
				{content}
			</ScrollView>

			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Create note"
				onPress={() => setCreateOpen(true)}
				style={{ bottom: insets.bottom + 24 }}
				className="absolute right-6 size-14 items-center justify-center rounded-full bg-primary shadow-lg shadow-black/20"
			>
				<Icon as={Plus} className="size-7 text-primary-foreground" />
			</Pressable>

			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>New note</DialogTitle>
					</DialogHeader>
					<Input
						placeholder="Note title"
						value={title}
						onChangeText={setTitle}
						autoFocus
					/>
					<DialogFooter>
						<Button
							onPress={handleCreate}
							disabled={title.trim().length === 0 || creating}
						>
							<Text>{creating ? "Creating…" : "Create note"}</Text>
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</View>
	);
}
