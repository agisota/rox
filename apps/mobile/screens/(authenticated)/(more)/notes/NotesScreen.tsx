import { useRouter } from "expo-router";
import { Notebook as NotebookIcon, Plus } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { useNotebooks } from "./hooks/useNotebooks";

export function NotesScreen() {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { notebooks, isLoading, error, creating, createNotebook, refresh } =
		useNotebooks();
	const [refreshing, setRefreshing] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const [name, setName] = useState("");

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await refresh();
		setRefreshing(false);
	}, [refresh]);

	const handleOpen = useCallback(
		(notebookId: string, notebookName: string) => {
			router.push({
				pathname: "/(authenticated)/(more)/notes/notebook",
				params: { notebookId, name: notebookName },
			});
		},
		[router],
	);

	const handleCreate = useCallback(async () => {
		const created = await createNotebook(name);
		if (created) {
			setName("");
			setCreateOpen(false);
		}
	}, [name, createNotebook]);

	const hasData = notebooks.length > 0;

	let content: React.ReactNode;
	if (error) {
		content = (
			<View className="items-center justify-center py-20">
				<Text className="text-center text-destructive">{error}</Text>
			</View>
		);
	} else if (!hasData && isLoading) {
		content = (
			<>
				<Skeleton className="h-20 w-full" />
				<Skeleton className="h-20 w-full" />
			</>
		);
	} else if (!hasData) {
		content = (
			<View className="items-center justify-center py-20">
				<Text className="text-center text-muted-foreground">
					No notebooks yet. Tap + to create one.
				</Text>
			</View>
		);
	} else {
		content = notebooks.map((notebook) => (
			<Pressable
				key={notebook.id}
				onPress={() => handleOpen(notebook.id, notebook.name)}
				className="active:opacity-80"
			>
				<Card>
					<CardContent className="flex-row items-center gap-3 pt-6">
						<Text className="text-2xl">{notebook.icon ?? null}</Text>
						{!notebook.icon ? (
							<Icon as={NotebookIcon} className="size-6 text-primary" />
						) : null}
						<Text className="flex-1 text-base font-medium" numberOfLines={1}>
							{notebook.name}
						</Text>
					</CardContent>
				</Card>
			</Pressable>
		));
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
				<View className="gap-3 p-6">{content}</View>
			</ScrollView>

			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Create notebook"
				onPress={() => setCreateOpen(true)}
				style={{ bottom: insets.bottom + 24 }}
				className="absolute right-6 size-14 items-center justify-center rounded-full bg-primary shadow-lg shadow-black/20"
			>
				<Icon as={Plus} className="size-7 text-primary-foreground" />
			</Pressable>

			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>New notebook</DialogTitle>
					</DialogHeader>
					<Input
						placeholder="Notebook name"
						value={name}
						onChangeText={setName}
						autoFocus
					/>
					<DialogFooter>
						<Button
							onPress={handleCreate}
							disabled={name.trim().length === 0 || creating}
						>
							<Text>{creating ? "Creating…" : "Create notebook"}</Text>
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</View>
	);
}
