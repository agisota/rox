import { Button } from "@rox/ui/button";
import { Kbd, KbdGroup } from "@rox/ui/kbd";
import { toast } from "@rox/ui/sonner";
import { useEffect, useState } from "react";
import { ExperimentalFeatureGate } from "renderer/components/ExperimentalFeatureGate";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	eventToPushToTalkAccelerator,
	formatPushToTalkAccelerator,
} from "./pushToTalkAccelerator";

/**
 * Settings surface for the desktop push-to-talk GLOBAL shortcut
 * (`live.pushToTalkDesktop`). Rendered only behind the experiment gate so it is
 * hidden until the feature is enabled + usable. The accelerator is owned by the
 * main process (it registers the OS-level `globalShortcut`), so this reads and
 * writes it over the `pushToTalk` tRPC router rather than the window-scoped
 * hotkey-override store.
 *
 * Toggle-to-talk: each press of the shortcut flips the mic in the active voice
 * room (Electron global accelerators are press-only, so true hold-to-talk is
 * not available).
 */
export function PushToTalkSettingsSection() {
	return (
		<ExperimentalFeatureGate featureId="live.pushToTalkDesktop">
			<PushToTalkSettingsSectionInner />
		</ExperimentalFeatureGate>
	);
}

function PushToTalkSettingsSectionInner() {
	const utils = electronTrpc.useUtils();
	const acceleratorQuery = electronTrpc.pushToTalk.getAccelerator.useQuery();
	const setAccelerator = electronTrpc.pushToTalk.setAccelerator.useMutation({
		onSuccess: () => {
			void utils.pushToTalk.getAccelerator.invalidate();
		},
		onError: () => {
			toast.error("Не удалось сохранить горячую клавишу push-to-talk");
		},
	});

	const [isRecording, setIsRecording] = useState(false);

	useEffect(() => {
		if (!isRecording) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			event.preventDefault();
			event.stopPropagation();

			if (event.key === "Escape") {
				setIsRecording(false);
				return;
			}

			const accelerator = eventToPushToTalkAccelerator(event);
			if (!accelerator) {
				// Wait for a complete combo (a non-modifier key plus a modifier).
				return;
			}

			setAccelerator.mutate({ accelerator });
			setIsRecording(false);
		};

		window.addEventListener("keydown", handleKeyDown, { capture: true });
		return () => {
			window.removeEventListener("keydown", handleKeyDown, { capture: true });
		};
	}, [isRecording, setAccelerator]);

	const accelerator = acceleratorQuery.data?.accelerator ?? "";
	const tokens = accelerator ? formatPushToTalkAccelerator(accelerator) : [];

	return (
		<div>
			<h3 className="text-sm font-medium text-muted-foreground mb-2">
				Push-to-talk (глобальная)
			</h3>
			<div className="rounded-lg border border-border overflow-hidden">
				<div className="flex items-center justify-between gap-4 px-4 py-3">
					<div className="space-y-0.5">
						<div className="text-sm font-medium">
							Переключение микрофона в голосовой комнате
						</div>
						<p className="text-xs text-muted-foreground">
							Глобальная горячая клавиша (работает, даже когда окно не в
							фокусе). Нажатие переключает микрофон активной голосовой комнаты —
							«toggle-to-talk» (системные горячие клавиши Electron срабатывают
							только на нажатие, удержание недоступно).
						</p>
					</div>
					<Button
						type="button"
						variant={isRecording ? "default" : "outline"}
						size="sm"
						aria-label="Записать горячую клавишу push-to-talk"
						onClick={() => setIsRecording((current) => !current)}
						disabled={acceleratorQuery.isLoading}
					>
						{isRecording ? (
							"Нажмите комбинацию…"
						) : tokens.length > 0 ? (
							<KbdGroup>
								{tokens.map((token) => (
									<Kbd key={token}>{token}</Kbd>
								))}
							</KbdGroup>
						) : (
							"Назначить"
						)}
					</Button>
				</div>
			</div>
		</div>
	);
}
