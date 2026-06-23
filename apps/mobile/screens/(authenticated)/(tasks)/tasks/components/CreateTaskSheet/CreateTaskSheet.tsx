import type { TaskPriority } from "@rox/db/enums";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";
import { MicButton } from "@/components/voice/MicButton";
import { apiClient } from "@/lib/trpc/client";
import type { MobileRecording } from "@/lib/voice/useDictation";
import { useCreateTask } from "./useCreateTask";

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
	{ value: "none", label: "None" },
	{ value: "low", label: "Low" },
	{ value: "medium", label: "Medium" },
	{ value: "high", label: "High" },
	{ value: "urgent", label: "Urgent" },
];

interface CreateTaskSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function CreateTaskSheet({ open, onOpenChange }: CreateTaskSheetProps) {
	const { submit, isSubmitting, error } = useCreateTask();
	const [title, setTitle] = useState("");
	const [description, setDescription] = useState("");
	const [priority, setPriority] = useState<TaskPriority>("none");
	const [transcribing, setTranscribing] = useState(false);

	const reset = () => {
		setTitle("");
		setDescription("");
		setPriority("none");
	};

	const handleOpenChange = (next: boolean) => {
		if (!next) reset();
		onOpenChange(next);
	};

	const handleCreate = async () => {
		const created = await submit({ title, description, priority });
		if (created) {
			reset();
			onOpenChange(false);
		}
	};

	const handleDictation = async (recording: MobileRecording) => {
		setTranscribing(true);
		try {
			const result = await apiClient.voice.transcribe.mutate({
				audioBase64: recording.audioBase64,
				mimeType: recording.mimeType,
				durationMs: recording.durationMs,
			});
			const text = result.processed?.ru || result.rawText;
			if (text) {
				setDescription((prev) => (prev ? `${prev} ${text}` : text));
			}
		} catch {
			// Keep the sheet usable on failure; the user can retry or type.
		} finally {
			setTranscribing(false);
		}
	};

	const canCreate = title.trim().length > 0 && !isSubmitting;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New task</DialogTitle>
				</DialogHeader>

				<View className="gap-3">
					<Input
						placeholder="Task title"
						value={title}
						onChangeText={setTitle}
						autoFocus
					/>
					<View className="gap-1.5">
						<View className="flex-row items-center justify-between">
							<Text className="text-sm text-muted-foreground">Description</Text>
							<MicButton
								onComplete={handleDictation}
								transcribing={transcribing}
							/>
						</View>
						<Textarea
							placeholder="Description (optional)"
							value={description}
							onChangeText={setDescription}
						/>
						{transcribing ? (
							<Text className="text-xs text-muted-foreground">Расшифровка…</Text>
						) : null}
					</View>

					<View className="gap-1.5">
						<Text className="text-sm text-muted-foreground">Priority</Text>
						<View className="flex-row flex-wrap gap-2">
							{PRIORITY_OPTIONS.map((option) => {
								const selected = option.value === priority;
								return (
									<Pressable
										key={option.value}
										onPress={() => setPriority(option.value)}
										className={
											selected
												? "rounded-full border border-primary bg-primary px-3 py-1"
												: "rounded-full border border-border px-3 py-1"
										}
									>
										<Text
											className={
												selected
													? "text-sm text-primary-foreground"
													: "text-sm text-foreground"
											}
										>
											{option.label}
										</Text>
									</Pressable>
								);
							})}
						</View>
					</View>

					{error ? (
						<Text className="text-sm text-destructive">{error}</Text>
					) : null}
				</View>

				<DialogFooter>
					<Button onPress={handleCreate} disabled={!canCreate}>
						<Text>{isSubmitting ? "Creating…" : "Create task"}</Text>
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
