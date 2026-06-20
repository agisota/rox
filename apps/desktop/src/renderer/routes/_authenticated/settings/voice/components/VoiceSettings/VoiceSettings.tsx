import { Label } from "@rox/ui/label";
import { Switch } from "@rox/ui/switch";
import { Textarea } from "@rox/ui/textarea";
import { ShieldCheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Settings → Voice: opt-out + customization + consent (Phase 4a).
 *
 * - "Голосовой ввод" (dictation) — on by default; off hides the mic button and
 *   disables the dictate hotkey.
 * - "Фоновый агент (always-on)" — opt-in (off by default) per the locked privacy
 *   decision; shows a recording indicator when it eventually runs. The runtime
 *   itself ships in a later phase; this only persists the consent flag.
 * - "Контекст для агента" — free-text the user supplies in advance, threaded into
 *   the dictation post-process so the model has their context.
 *
 * Persistence mirrors the Behavior page: electronTrpc.settings.* → local SQLite,
 * with optimistic updates.
 */
export function VoiceSettings() {
	const utils = electronTrpc.useUtils();

	// --- Dictation toggle ---------------------------------------------------
	const { data: dictationEnabled, isLoading: isDictationLoading } =
		electronTrpc.settings.getDictationEnabled.useQuery();
	const setDictationEnabled =
		electronTrpc.settings.setDictationEnabled.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getDictationEnabled.cancel();
				const previous = utils.settings.getDictationEnabled.getData();
				utils.settings.getDictationEnabled.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getDictationEnabled.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getDictationEnabled.invalidate();
			},
		});

	// --- Ambient capture toggle (opt-in) ------------------------------------
	const { data: ambientCaptureEnabled, isLoading: isAmbientLoading } =
		electronTrpc.settings.getAmbientCaptureEnabled.useQuery();
	const setAmbientCaptureEnabled =
		electronTrpc.settings.setAmbientCaptureEnabled.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getAmbientCaptureEnabled.cancel();
				const previous = utils.settings.getAmbientCaptureEnabled.getData();
				utils.settings.getAmbientCaptureEnabled.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getAmbientCaptureEnabled.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getAmbientCaptureEnabled.invalidate();
			},
		});

	// --- Agent context (free text) ------------------------------------------
	const { data: voiceAgentContext } =
		electronTrpc.settings.getVoiceAgentContext.useQuery();
	const setVoiceAgentContext =
		electronTrpc.settings.setVoiceAgentContext.useMutation({
			onSettled: () => {
				utils.settings.getVoiceAgentContext.invalidate();
			},
		});

	// Local draft so typing is smooth; persisted on blur. Seeded from the query
	// once it resolves (cache-first: only adopt the server value before the user
	// has started editing).
	const [contextDraft, setContextDraft] = useState("");
	const [contextDirty, setContextDirty] = useState(false);
	useEffect(() => {
		if (!contextDirty && voiceAgentContext !== undefined) {
			setContextDraft(voiceAgentContext);
		}
	}, [voiceAgentContext, contextDirty]);

	const persistContext = () => {
		const next = contextDraft;
		if (next === (voiceAgentContext ?? "")) {
			setContextDirty(false);
			return;
		}
		setVoiceAgentContext.mutate({ context: next });
		setContextDirty(false);
	};

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div className="space-y-0.5 pr-6">
					<Label htmlFor="dictation-enabled" className="font-medium text-sm">
						Голосовой ввод
					</Label>
					<p className="text-muted-foreground text-xs">
						Кнопка микрофона в поле ввода и горячая клавиша для диктовки
						промптов. Когда выключено — микрофон скрыт, диктовка недоступна.
					</p>
				</div>
				<Switch
					id="dictation-enabled"
					checked={dictationEnabled ?? true}
					onCheckedChange={(enabled) => setDictationEnabled.mutate({ enabled })}
					disabled={isDictationLoading || setDictationEnabled.isPending}
				/>
			</div>

			<div className="flex items-center justify-between">
				<div className="space-y-0.5 pr-6">
					<Label htmlFor="ambient-capture" className="font-medium text-sm">
						Фоновый агент (always-on)
					</Label>
					<p className="text-muted-foreground text-xs">
						Постоянное прослушивание для проактивной помощи. По умолчанию{" "}
						<span className="font-medium text-foreground">выключено</span> и
						включается только вами. Когда активно — показывается индикатор
						записи. Ничего не записывается, пока вы это не включите.
					</p>
				</div>
				<Switch
					id="ambient-capture"
					checked={ambientCaptureEnabled ?? false}
					onCheckedChange={(enabled) =>
						setAmbientCaptureEnabled.mutate({ enabled })
					}
					disabled={isAmbientLoading || setAmbientCaptureEnabled.isPending}
				/>
			</div>

			<div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3">
				<ShieldCheckIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
				<p className="select-text text-muted-foreground text-xs leading-snug">
					Приватность: фоновый захват по умолчанию отключён (opt-in). При
					включении появляется видимый индикатор записи. Аудио обрабатывается на
					нашем API только для распознавания.
				</p>
			</div>

			<div className="space-y-1.5">
				<Label htmlFor="voice-agent-context" className="font-medium text-sm">
					Контекст для агента
				</Label>
				<p className="text-muted-foreground text-xs">
					Задайте контекст заранее — термины, имена, проекты, предпочтения. Он
					помогает точнее распознавать и оформлять надиктованное (и будет
					использоваться фоновым агентом).
				</p>
				<Textarea
					id="voice-agent-context"
					value={contextDraft}
					onChange={(e) => {
						setContextDirty(true);
						setContextDraft(e.target.value);
					}}
					onBlur={persistContext}
					placeholder="Напр.: Я соло-фаундер. Проект Set — десктоп-приложение на Electron. Отвечай по-русски, BLUF."
					className="min-h-28 select-text"
					maxLength={10_000}
				/>
			</div>
		</div>
	);
}
