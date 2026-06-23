import { MapPin } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { Icon } from "@/components/ui/icon";
import { Text } from "@/components/ui/text";
import type { AgendaItem } from "../../utils/buildAgenda";
import { formatTimeRange } from "../../utils/formatTimeRange";

interface AgendaItemRowProps {
	item: AgendaItem;
	onPress: (eventId: string) => void;
}

export function AgendaItemRow({ item, onPress }: AgendaItemRowProps) {
	const time = formatTimeRange(item.start, item.end, item.allDay);
	return (
		<Pressable
			onPress={() => onPress(item.eventId)}
			className="flex-row gap-3 px-4 py-3 active:opacity-70"
		>
			<View className="w-20 pt-0.5">
				<Text className="text-xs font-medium text-muted-foreground">
					{time}
				</Text>
			</View>
			<View className="flex-1">
				<Text className="text-base font-medium" numberOfLines={1}>
					{item.title}
				</Text>
				{item.location ? (
					<View className="mt-0.5 flex-row items-center gap-1">
						<Icon as={MapPin} className="size-3.5 text-muted-foreground" />
						<Text className="text-xs text-muted-foreground" numberOfLines={1}>
							{item.location}
						</Text>
					</View>
				) : null}
			</View>
		</Pressable>
	);
}
