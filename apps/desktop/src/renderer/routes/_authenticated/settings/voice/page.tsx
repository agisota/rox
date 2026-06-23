import { createFileRoute } from "@tanstack/react-router";
import { VoiceHistorySettings } from "./components/VoiceHistorySettings";
import { VoiceSettings } from "./components/VoiceSettings";

export const Route = createFileRoute("/_authenticated/settings/voice/")({
	component: VoicePage,
});

function VoicePage() {
	return (
		<div className="mx-auto max-w-3xl px-6 py-8">
			<header className="mb-6">
				<h1 className="font-semibold text-2xl text-foreground">Голос</h1>
				<p className="mt-1 text-muted-foreground text-sm">
					Голосовой ввод, фоновый агент и контекст для распознавания.
				</p>
			</header>

			<VoiceSettings />

			<div className="mt-10 border-border border-t pt-8">
				<VoiceHistorySettings />
			</div>
		</div>
	);
}
