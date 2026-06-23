import { Mic } from "lucide-react-native";
import { ActivityIndicator, Pressable } from "react-native";
import { Icon } from "@/components/ui/icon";
import {
	type MobileRecording,
	useMobileDictation,
} from "@/lib/voice/useDictation";

export interface MicButtonProps {
	/** Fired with the encoded clip once a hold-to-record gesture completes. */
	onComplete: (recording: MobileRecording) => void;
	/** External busy flag (e.g. while the host awaits voice.transcribe). */
	transcribing?: boolean;
	disabled?: boolean;
}

/**
 * Hold-to-record mic button for mobile. Press and hold to record, release to
 * stop + transcribe. RN-native (Pressable + lucide Mic via the repo Icon
 * wrapper + ActivityIndicator) — deliberately NOT the browser-DOM MicButton in
 * packages/ui, which depends on MediaRecorder/pointer events and cannot run in
 * React Native.
 */
export function MicButton({
	onComplete,
	transcribing,
	disabled,
}: MicButtonProps) {
	const dictation = useMobileDictation({ onComplete });

	const busy = dictation.state === "transcribing" || transcribing === true;
	const isDisabled = disabled === true || busy;

	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel="Диктовать описание"
			accessibilityHint="Удерживайте, чтобы записать, отпустите, чтобы расшифровать"
			disabled={isDisabled}
			onPressIn={() => {
				if (!isDisabled) void dictation.start();
			}}
			onPressOut={() => {
				void dictation.stop();
			}}
			className={
				dictation.isRecording
					? "size-9 items-center justify-center rounded-full bg-red-500/15"
					: "size-9 items-center justify-center rounded-full bg-foreground/10"
			}
			style={isDisabled && !busy ? { opacity: 0.4 } : undefined}
		>
			{busy ? (
				<ActivityIndicator size="small" />
			) : (
				<Icon
					as={Mic}
					className={
						dictation.isRecording
							? "size-5 text-red-500"
							: "size-5 text-muted-foreground"
					}
				/>
			)}
		</Pressable>
	);
}
