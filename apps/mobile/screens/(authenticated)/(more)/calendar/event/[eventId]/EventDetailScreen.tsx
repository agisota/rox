import type { CalAttendeeStatus } from "@rox/db/enums";
import { useLocalSearchParams } from "expo-router";
import { Clock, MapPin, Users } from "lucide-react-native";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { formatTimeRange } from "../../utils/formatTimeRange";
import { useEventDetail } from "./hooks/useEventDetail";

const RSVP_OPTIONS: { value: CalAttendeeStatus; label: string }[] = [
	{ value: "accepted", label: "Going" },
	{ value: "tentative", label: "Maybe" },
	{ value: "declined", label: "Not going" },
];

const STATUS_LABEL: Record<CalAttendeeStatus, string> = {
	needs_action: "No response",
	accepted: "Going",
	declined: "Not going",
	tentative: "Maybe",
};

function formatDay(value: Date | string): string {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleDateString(undefined, {
		weekday: "long",
		month: "long",
		day: "numeric",
	});
}

export function EventDetailScreen() {
	const { eventId } = useLocalSearchParams<{ eventId: string }>();
	const insets = useSafeAreaInsets();
	const { detail, isLoading, error, rsvping, rsvp } = useEventDetail(eventId);

	const event = detail?.event ?? null;
	const attendees = detail?.attendees ?? [];

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
				) : !event ? (
					isLoading ? (
						<View className="gap-3">
							<Skeleton className="h-7 w-2/3" />
							<Skeleton className="h-20 w-full" />
							<Skeleton className="h-24 w-full" />
						</View>
					) : (
						<View className="items-center justify-center py-20">
							<Text className="text-center text-muted-foreground">
								Event not found.
							</Text>
						</View>
					)
				) : (
					<>
						<Text className="text-2xl font-bold">{event.title}</Text>

						<Card>
							<CardContent className="gap-3 pt-6">
								<View className="flex-row items-start gap-2">
									<Icon
										as={Clock}
										className="mt-0.5 size-5 text-muted-foreground"
									/>
									<View className="flex-1">
										<Text>{formatDay(event.dtstart)}</Text>
										<Text className="text-muted-foreground">
											{formatTimeRange(
												new Date(event.dtstart),
												new Date(event.dtend),
												event.allDay,
											)}
										</Text>
									</View>
								</View>

								{event.location ? (
									<View className="flex-row items-start gap-2">
										<Icon
											as={MapPin}
											className="mt-0.5 size-5 text-muted-foreground"
										/>
										<Text className="flex-1">{event.location}</Text>
									</View>
								) : null}
							</CardContent>
						</Card>

						{event.description ? (
							<Card>
								<CardHeader>
									<CardTitle>Description</CardTitle>
								</CardHeader>
								<CardContent>
									<Text className="text-muted-foreground">
										{event.description}
									</Text>
								</CardContent>
							</Card>
						) : null}

						{attendees.length > 0 ? (
							<Card>
								<CardHeader>
									<View className="flex-row items-center gap-2">
										<Icon as={Users} className="size-5 text-foreground" />
										<CardTitle>Attendees</CardTitle>
									</View>
								</CardHeader>
								<CardContent className="gap-2">
									{attendees.map((attendee) => (
										<View
											key={attendee.id}
											className="flex-row items-center justify-between"
										>
											<Text numberOfLines={1} className="flex-1">
												{attendee.email ?? attendee.userId ?? "Attendee"}
												{attendee.isOrganizer ? " (organizer)" : ""}
											</Text>
											<Badge variant="outline">
												<Text>
													{STATUS_LABEL[attendee.status as CalAttendeeStatus] ??
														attendee.status}
												</Text>
											</Badge>
										</View>
									))}
								</CardContent>
							</Card>
						) : null}

						<Card>
							<CardHeader>
								<CardTitle>Your RSVP</CardTitle>
							</CardHeader>
							<CardContent>
								<View className="flex-row flex-wrap gap-2">
									{RSVP_OPTIONS.map((option) => (
										<Pressable
											key={option.value}
											onPress={() => rsvp(option.value)}
											disabled={rsvping}
											className="rounded-full border border-border px-4 py-2 active:opacity-70 disabled:opacity-50"
										>
											<Text className="text-sm text-foreground">
												{option.label}
											</Text>
										</Pressable>
									))}
								</View>
							</CardContent>
						</Card>
					</>
				)}
			</View>
		</ScrollView>
	);
}
