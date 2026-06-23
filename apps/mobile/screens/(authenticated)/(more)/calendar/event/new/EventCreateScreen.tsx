import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import { ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EventForm } from "../../components/EventForm";
import { useCalendarMutations } from "../../hooks/useCalendarMutations";
import {
	type EventFormResult,
	type EventFormValues,
	toDateInput,
	toTimeInput,
} from "../../utils/eventForm";

/** Round a date up to the next half hour for sensible default start/end times. */
function nextHalfHour(from: Date): Date {
	const d = new Date(from);
	d.setSeconds(0, 0);
	d.setMinutes(d.getMinutes() > 30 ? 60 : 30);
	return d;
}

export function EventCreateScreen() {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { saving, error, createEvent } = useCalendarMutations();

	const initialValues = useMemo<EventFormValues>(() => {
		const start = nextHalfHour(new Date());
		const end = new Date(start.getTime() + 60 * 60 * 1000);
		return {
			title: "",
			location: "",
			startDate: toDateInput(start),
			startTime: toTimeInput(start),
			endDate: toDateInput(end),
			endTime: toTimeInput(end),
			allDay: false,
			attendees: "",
		};
	}, []);

	const handleSubmit = useCallback(
		async (value: EventFormResult) => {
			const id = await createEvent(value);
			if (id) router.back();
		},
		[createEvent, router],
	);

	return (
		<ScrollView
			className="flex-1 bg-background"
			contentContainerStyle={{ paddingTop: insets.top, paddingBottom: 48 }}
			keyboardShouldPersistTaps="handled"
		>
			<EventForm
				initialValues={initialValues}
				submitLabel="Create event"
				saving={saving}
				error={error}
				onSubmit={handleSubmit}
			/>
		</ScrollView>
	);
}
