import { File, Folder, Share2 } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import { formatBytes } from "../../utils/formatBytes";

function formatDate(value: Date | string | null): string | null {
	if (!value) return null;
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toLocaleDateString();
}

interface FolderRowProps {
	name: string;
	updatedAt: Date | string | null;
	onPress: () => void;
	onShare: () => void;
}

export function FolderRow({
	name,
	updatedAt,
	onPress,
	onShare,
}: FolderRowProps) {
	const updated = formatDate(updatedAt);
	return (
		<Pressable
			onPress={onPress}
			className="flex-row items-center gap-3 px-4 py-3 active:opacity-70"
		>
			<Icon as={Folder} className="size-6 text-primary" />
			<View className="flex-1">
				<Text className="text-base font-medium" numberOfLines={1}>
					{name}
				</Text>
				{updated ? (
					<Text className="text-xs text-muted-foreground">
						Updated {updated}
					</Text>
				) : null}
			</View>
			<Pressable
				onPress={onShare}
				hitSlop={8}
				accessibilityRole="button"
				accessibilityLabel={`Share folder ${name}`}
				className="p-1 active:opacity-60"
			>
				<Icon as={Share2} className="size-5 text-muted-foreground" />
			</Pressable>
		</Pressable>
	);
}

interface FileRowProps {
	name: string;
	sizeBytes: number;
	updatedAt: Date | string | null;
	onShare: () => void;
}

export function FileRow({ name, sizeBytes, updatedAt, onShare }: FileRowProps) {
	const updated = formatDate(updatedAt);
	const meta = [formatBytes(sizeBytes), updated ? `Updated ${updated}` : null]
		.filter(Boolean)
		.join(" · ");
	return (
		<View className="flex-row items-center gap-3 px-4 py-3">
			<Icon as={File} className="size-6 text-muted-foreground" />
			<View className="flex-1">
				<Text className="text-base font-medium" numberOfLines={1}>
					{name}
				</Text>
				{meta ? (
					<Text className="text-xs text-muted-foreground">{meta}</Text>
				) : null}
			</View>
			<Pressable
				onPress={onShare}
				hitSlop={8}
				accessibilityRole="button"
				accessibilityLabel={`Share file ${name}`}
				className="p-1 active:opacity-60"
			>
				<Icon as={Share2} className="size-5 text-muted-foreground" />
			</Pressable>
		</View>
	);
}
