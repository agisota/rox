import { useLocalSearchParams, useRouter } from "expo-router";
import { FolderPlus } from "lucide-react-native";
import { useCallback, useState } from "react";
import {
	Alert,
	Pressable,
	RefreshControl,
	ScrollView,
	Share,
	View,
} from "react-native";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { apiClient } from "@/lib/trpc/client";
import { FileRow, FolderRow } from "./components/DriveRow";
import { useDriveFolder } from "./hooks/useDriveFolder";
import { driveShareUrl } from "./utils/shareUrl";

export function DriveScreen() {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { folderId: folderIdParam, name } = useLocalSearchParams<{
		folderId?: string;
		name?: string;
	}>();
	const folderId = folderIdParam ?? null;

	const { listing, isLoading, error, refresh } = useDriveFolder(folderId);
	const [refreshing, setRefreshing] = useState(false);
	const [createOpen, setCreateOpen] = useState(false);
	const [newName, setNewName] = useState("");
	const [creating, setCreating] = useState(false);

	const onRefresh = useCallback(async () => {
		setRefreshing(true);
		await refresh();
		setRefreshing(false);
	}, [refresh]);

	const handleOpenFolder = useCallback(
		(id: string, folderName: string) => {
			router.push({
				pathname: "/(authenticated)/(more)/drive/folder",
				params: { folderId: id, name: folderName },
			});
		},
		[router],
	);

	const shareTarget = useCallback(
		async (target: { fileId: string } | { folderId: string }) => {
			try {
				const created = await apiClient.drive.createShare.mutate(target);
				if (!created) return;
				const url = driveShareUrl(created.token);
				await Share.share({ message: url, url });
			} catch (err) {
				Alert.alert(
					"Could not create share",
					err instanceof Error ? err.message : "Please try again.",
				);
			}
		},
		[],
	);

	const handleCreateFolder = useCallback(async () => {
		const trimmed = newName.trim();
		if (trimmed.length === 0) return;
		setCreating(true);
		try {
			await apiClient.drive.createFolder.mutate({
				name: trimmed,
				parentId: folderId,
			});
			setNewName("");
			setCreateOpen(false);
			await refresh();
		} catch (err) {
			Alert.alert(
				"Could not create folder",
				err instanceof Error ? err.message : "Please try again.",
			);
		} finally {
			setCreating(false);
		}
	}, [newName, folderId, refresh]);

	const folders = listing?.folders ?? [];
	const files = listing?.files ?? [];
	const hasData = folders.length > 0 || files.length > 0;

	let content: React.ReactNode;
	if (error) {
		content = (
			<View className="items-center justify-center py-20 px-6">
				<Text className="text-center text-destructive">{error}</Text>
			</View>
		);
	} else if (!hasData && isLoading) {
		content = (
			<View className="gap-3 p-4">
				<Skeleton className="h-14 w-full" />
				<Skeleton className="h-14 w-full" />
				<Skeleton className="h-14 w-full" />
			</View>
		);
	} else if (!hasData) {
		content = (
			<View className="items-center justify-center py-20 px-6">
				<Text className="text-center text-muted-foreground">
					This folder is empty. Tap the + to create a folder, or upload files on
					web or desktop.
				</Text>
			</View>
		);
	} else {
		content = (
			<View>
				{folders.map((folder) => (
					<FolderRow
						key={folder.id}
						name={folder.name}
						updatedAt={folder.updatedAt}
						onPress={() => handleOpenFolder(folder.id, folder.name)}
						onShare={() => shareTarget({ folderId: folder.id })}
					/>
				))}
				{files.map((file) => (
					<FileRow
						key={file.id}
						name={file.name}
						sizeBytes={Number(file.sizeBytes)}
						updatedAt={file.updatedAt}
						onShare={() => shareTarget({ fileId: file.id })}
					/>
				))}
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
				{name ? (
					<Text className="px-4 pt-4 text-xs font-semibold uppercase text-muted-foreground">
						{name}
					</Text>
				) : null}
				{content}
			</ScrollView>

			<Pressable
				accessibilityRole="button"
				accessibilityLabel="Create folder"
				onPress={() => setCreateOpen(true)}
				style={{ bottom: insets.bottom + 24 }}
				className="absolute right-6 size-14 items-center justify-center rounded-full bg-primary shadow-lg shadow-black/20"
			>
				<Icon as={FolderPlus} className="size-7 text-primary-foreground" />
			</Pressable>

			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>New folder</DialogTitle>
					</DialogHeader>
					<Input
						placeholder="Folder name"
						value={newName}
						onChangeText={setNewName}
						autoFocus
					/>
					<DialogFooter>
						<Button
							onPress={handleCreateFolder}
							disabled={newName.trim().length === 0 || creating}
						>
							<Text>{creating ? "Creating…" : "Create folder"}</Text>
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</View>
	);
}
