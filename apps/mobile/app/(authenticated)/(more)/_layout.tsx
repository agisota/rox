import { Stack } from "expo-router";

export default function MoreLayout() {
	return (
		<Stack>
			<Stack.Screen name="index" options={{ headerShown: false }} />
			<Stack.Screen name="settings" options={{ title: "Settings" }} />
			<Stack.Screen name="drive/index" options={{ title: "Drive" }} />
			<Stack.Screen name="drive/folder" options={{ title: "Folder" }} />
			<Stack.Screen name="calendar/index" options={{ title: "Calendar" }} />
			<Stack.Screen name="calendar/event" options={{ title: "Event" }} />
			<Stack.Screen
				name="calendar/event-new"
				options={{ title: "New event" }}
			/>
			<Stack.Screen
				name="calendar/event-edit"
				options={{ title: "Edit event" }}
			/>
			<Stack.Screen name="notes/index" options={{ title: "Notes" }} />
			<Stack.Screen name="notes/notebook" options={{ title: "Notebook" }} />
			<Stack.Screen name="notes/note" options={{ title: "Note" }} />
			<Stack.Screen name="notes/note-edit" options={{ title: "Edit note" }} />
			<Stack.Screen name="mail/index" options={{ title: "Mail" }} />
			<Stack.Screen name="mail/thread" options={{ title: "Thread" }} />
			<Stack.Screen name="chat/index" options={{ title: "Chat" }} />
			<Stack.Screen name="chat/thread" options={{ title: "Thread" }} />
		</Stack>
	);
}
