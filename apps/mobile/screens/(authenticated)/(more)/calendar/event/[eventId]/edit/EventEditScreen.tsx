import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Text } from "@/components/ui/text";
import { EventForm } from "../../../components/EventForm";
import { useCalendarMutations } from "../../../hooks/useCalendarMutations";
import {
	type EventFormResult,
	type EventFormValues,
	toDateInput,
	toTimeInput,
} from "../../../utils/eventForm";
import { useEventDetail } from "../hooks/useEventDetail";

export function EventEditScreen() {
	const { eventId } = useLocalSearchParams<{ eventId: string }>();
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { detail, isLoading, error } = useEventDetail(eventId);
	const {
		saving,
		deleting,
		error: mutationError,
		updateEvent,
		deleteEvent,
	} = useCalendarMutations();

	const event = detail?.event ?? null;

	const initialValues = useMemo<EventFormValues | null>(() => {
		if (!event) return null;
		const start = new Date(event.dtstart);
		const end = new Date(event.dtend);
		const attendeeEmails = (detail?.attendees ?? [])
			.map((a) => a.email)
			.filter((e): e is string => Boolean(e));
		return {
			title: event.title,
			location: event.location ?? "",
			startDate: toDateInput(start),
			startTime: toTimeInput(start),
			endDate: toDateInput(end),
			endTime: toTimeInput(end),
			allDay: event.allDay,
			attendees: attendeeEmails.join(", "),
		};
	}, [event, detail?.attendees]);

	const handleSubmit = useCallback(
		async (value: EventFormResult) => {
			if (!eventId) return;
			const ok = await updateEvent(eventId, value);
			if (ok) router.back();
		},
		[eventId, updateEvent, router],
	);

	const handleDelete = useCallback(() => {
		if (!eventId) return;
		Alert.alert("Delete event", "This event will be permanently removed.", [
			{ text: "Cancel", style: "cancel" },
			{
				text: "Delete",
				style: "destructive",
				onPress: async () => {
					const ok = await deleteEvent(eventId);
					if (ok) router.back();
				},
			},
		]);
	}, [eventId, deleteEvent, router]);

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
				) : !initialValues ? (
					isLoading ? (
						<View className="gap-3">
							<Skeleton className="h-12 w-full" />
							<Skeleton className="h-12 w-full" />
							<Skeleton className="h-12 w-full" />
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
						<EventForm
							initialValues={initialValues}
							submitLabel="Save changes"
							saving={saving}
							error={mutationError}
							onSubmit={handleSubmit}
						/>
						<Button
							variant="destructive"
							onPress={handleDelete}
							disabled={deleting}
						>
							<Text>{deleting ? "Deleting…" : "Delete event"}</Text>
						</Button>
					</>
				)}
			</View>
		</ScrollView>
	);
}
