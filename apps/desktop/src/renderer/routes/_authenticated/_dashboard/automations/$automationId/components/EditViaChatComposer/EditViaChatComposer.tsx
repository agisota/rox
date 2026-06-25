import { Button } from "@rox/ui/button";
import { AnimatedHeight } from "@rox/ui/motion";
import { Textarea } from "@rox/ui/textarea";
import { cn } from "@rox/ui/utils";
import { useState } from "react";
import { LuLoaderCircle, LuSparkles, LuWandSparkles } from "react-icons/lu";
import {
	type AutomationPromptEditResult,
	requestAutomationPromptEdit,
} from "../../lib/promptEdit";

interface EditViaChatComposerProps {
	automationId: string;
	/** The prompt as it currently stands in the editor (live). */
	currentPrompt: string;
	/** Whether a save is currently in flight (disables submit). */
	isSaving: boolean;
	/**
	 * Apply a regenerated prompt: update the editor + persist it. Returns once
	 * the persist mutation settles so the composer can clear its pending state.
	 */
	onApply: (nextPrompt: string) => Promise<void> | void;
}

/**
 * Conversational affordance to (re)generate an automation's prompt from a
 * natural-language change description. Sits under the markdown editor in the
 * detail view. Talks only to `requestAutomationPromptEdit` (server seam), then
 * hands the result up via `onApply` which persists through `automation.setPrompt`.
 *
 * Dark glass, Victor Mono, RU — matches the surrounding Automations surface.
 */
export function EditViaChatComposer({
	automationId,
	currentPrompt,
	isSaving,
	onApply,
}: EditViaChatComposerProps) {
	const [instruction, setInstruction] = useState("");
	const [pending, setPending] = useState(false);
	const [lastResult, setLastResult] =
		useState<AutomationPromptEditResult | null>(null);

	const trimmed = instruction.trim();
	const canSubmit = trimmed.length > 0 && !pending && !isSaving;

	const submit = async () => {
		if (!canSubmit) return;
		setPending(true);
		try {
			const result = await requestAutomationPromptEdit({
				automationId,
				currentPrompt,
				instruction: trimmed,
			});
			await onApply(result.prompt);
			setLastResult(result);
			setInstruction("");
		} finally {
			setPending(false);
		}
	};

	return (
		<div
			className={cn(
				// Dark glass card consistent with the Automations surface.
				"mt-8 rounded-xl border border-border/60 bg-card/70 backdrop-blur-md",
				"shadow-sm",
			)}
		>
			<div className="flex items-center gap-2 border-b border-border/50 px-4 py-2.5">
				<LuWandSparkles className="size-4 text-primary/80" />
				<span className="text-sm font-medium">Изменить через чат</span>
				<span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
					beta
				</span>
			</div>

			<div className="flex flex-col gap-2.5 px-4 py-3">
				<Textarea
					value={instruction}
					onChange={(event) => setInstruction(event.target.value)}
					onKeyDown={(event) => {
						if (
							(event.metaKey || event.ctrlKey) &&
							event.key === "Enter" &&
							canSubmit
						) {
							event.preventDefault();
							void submit();
						}
					}}
					placeholder="Опишите правку: «запускай по будням в 9:00» или «замени $sentry на $datadog»"
					className="min-h-[64px] resize-none bg-background/40 font-mono text-[13px] leading-relaxed"
					disabled={pending}
				/>

				<div className="flex items-center justify-between gap-3">
					<p className="min-w-0 flex-1 truncate text-xs text-muted-foreground/80">
						{lastResult ? (
							<span className="inline-flex items-center gap-1.5">
								<LuSparkles className="size-3 shrink-0 text-primary/70" />
								<span className="truncate">{lastResult.note}</span>
								{lastResult.local && (
									<span className="shrink-0 font-mono text-[10px] text-muted-foreground/60">
										локально
									</span>
								)}
							</span>
						) : (
							<span>Промпт обновится и сохранится новой версией.</span>
						)}
					</p>

					<Button
						type="button"
						size="sm"
						className="h-8 shrink-0 gap-1.5"
						disabled={!canSubmit}
						onClick={() => void submit()}
					>
						{pending ? (
							<LuLoaderCircle className="size-3.5 animate-spin" />
						) : (
							<LuSparkles className="size-3.5" />
						)}
						<span>Применить</span>
						<kbd className="ml-1 hidden font-mono text-[10px] text-primary-foreground/70 sm:inline">
							⌘↵
						</kbd>
					</Button>
				</div>

				<AnimatedHeight open={lastResult?.local === true}>
					<p className="pt-0.5 text-[11px] leading-snug text-muted-foreground/60">
						Подключение к агенту ещё не готово — правка применена
						детермини­рованно на устройстве. Когда серверный путь будет включён,
						тот же ввод переключится на модель без изменений интерфейса.
					</p>
				</AnimatedHeight>
			</div>
		</div>
	);
}
