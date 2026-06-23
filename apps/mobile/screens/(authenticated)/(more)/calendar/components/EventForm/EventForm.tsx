import { useCallback, useState } from "react";
import { View } from "react-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Text } from "@/components/ui/text";
import {
	type EventFormResult,
	type EventFormValues,
	validateEventForm,
} from "../../utils/eventForm";

interface EventFormProps {
	initialValues: EventFormValues;
	submitLabel: string;
	saving: boolean;
	/** External error (e.g. from the mutation hook) shown below the form. */
	error?: string | null;
	onSubmit: (value: EventFormResult) => void;
}

interface FieldProps {
	label: string;
	value: string;
	placeholder?: string;
	autoCapitalize?: "none" | "sentences";
	keyboardType?: "default" | "email-address" | "numbers-and-punctuation";
	onChangeText: (text: string) => void;
}

function Field({
	label,
	value,
	placeholder,
	autoCapitalize = "sentences",
	keyboardType = "default",
	onChangeText,
}: FieldProps) {
	return (
		<View className="gap-1.5">
			<Label>{label}</Label>
			<Input
				value={value}
				placeholder={placeholder}
				autoCapitalize={autoCapitalize}
				keyboardType={keyboardType}
				onChangeText={onChangeText}
			/>
		</View>
	);
}

/**
 * Create/edit form for a calendar event. Date + time are plain `YYYY-MM-DD` /
 * `HH:MM` text fields so the form needs no native picker dependency; validation
 * + conversion live in the pure {@link validateEventForm} helper. Wire `onSubmit`
 * to `calendar.createEvent` / `calendar.updateEvent`.
 */
export function EventForm({
	initialValues,
	submitLabel,
	saving,
	error,
	onSubmit,
}: EventFormProps) {
	const [values, setValues] = useState<EventFormValues>(initialValues);
	const [localError, setLocalError] = useState<string | null>(null);

	const set = useCallback(
		<K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) => {
			setValues((prev) => ({ ...prev, [key]: value }));
		},
		[],
	);

	const handleSubmit = useCallback(() => {
		const result = validateEventForm(values);
		if (!result.ok) {
			setLocalError(result.error);
			return;
		}
		setLocalError(null);
		onSubmit(result.value);
	}, [values, onSubmit]);

	const message = localError ?? error ?? null;

	return (
		<View className="gap-4">
			<Field
				label="Title"
				value={values.title}
				placeholder="Event title"
				onChangeText={(t) => set("title", t)}
			/>
			<Field
				label="Location"
				value={values.location}
				placeholder="Optional"
				onChangeText={(t) => set("location", t)}
			/>

			<View className="flex-row items-center justify-between">
				<Label>All-day</Label>
				<Switch
					checked={values.allDay}
					onCheckedChange={(checked) => set("allDay", checked)}
				/>
			</View>

			<View className="flex-row gap-3">
				<View className="flex-1">
					<Field
						label="Start date"
						value={values.startDate}
						placeholder="YYYY-MM-DD"
						autoCapitalize="none"
						onChangeText={(t) => set("startDate", t)}
					/>
				</View>
				{!values.allDay ? (
					<View className="w-28">
						<Field
							label="Start time"
							value={values.startTime}
							placeholder="HH:MM"
							autoCapitalize="none"
							onChangeText={(t) => set("startTime", t)}
						/>
					</View>
				) : null}
			</View>

			<View className="flex-row gap-3">
				<View className="flex-1">
					<Field
						label="End date"
						value={values.endDate}
						placeholder="YYYY-MM-DD"
						autoCapitalize="none"
						onChangeText={(t) => set("endDate", t)}
					/>
				</View>
				{!values.allDay ? (
					<View className="w-28">
						<Field
							label="End time"
							value={values.endTime}
							placeholder="HH:MM"
							autoCapitalize="none"
							onChangeText={(t) => set("endTime", t)}
						/>
					</View>
				) : null}
			</View>

			<Field
				label="Attendees"
				value={values.attendees}
				placeholder="email@example.com, …"
				autoCapitalize="none"
				keyboardType="email-address"
				onChangeText={(t) => set("attendees", t)}
			/>

			{message ? (
				<Text className="text-sm text-destructive">{message}</Text>
			) : null}

			<Button onPress={handleSubmit} disabled={saving}>
				<Text>{saving ? "Saving…" : submitLabel}</Text>
			</Button>
		</View>
	);
}
