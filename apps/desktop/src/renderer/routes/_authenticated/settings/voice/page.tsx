import { createFileRoute } from "@tanstack/react-router";
import { VoiceHistorySettings } from "./components/VoiceHistorySettings";

export const Route = createFileRoute("/_authenticated/settings/voice/")({
	component: VoicePage,
});

function VoicePage() {
	return <VoiceHistorySettings />;
}
