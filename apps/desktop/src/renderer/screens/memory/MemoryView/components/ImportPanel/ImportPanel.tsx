import { Button } from "@rox/ui/button";
import { toast } from "@rox/ui/sonner";
import { Textarea } from "@rox/ui/textarea";
import { useState } from "react";
import { apiClient } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";

const EXPORT_PROMPT = `Выгрузи всё, что ты помнишь обо мне, одним списком по категориям. Используй ровно эти заголовки категорий: Instructions, Identity, Career, Projects, Preferences. Под каждым заголовком — по одной записи на строку в формате:
[YYYY-MM-DD] - текст записи
Ничего не добавляй сверх этого списка.`;

/**
 * Import-from-other-AI panel: a copyable export prompt for the user to send to
 * another assistant, plus a paste box whose contents are parsed server-side and
 * distributed into the memory groups as suggestions (memory.submitPromptImport).
 */
export function ImportPanel() {
	const [open, setOpen] = useState(false);
	const [pasted, setPasted] = useState("");
	const [busy, setBusy] = useState(false);

	const copyPrompt = async () => {
		try {
			await navigator.clipboard.writeText(EXPORT_PROMPT);
			toast.success("Промпт скопирован");
		} catch {
			toast.error("Не удалось скопировать");
		}
	};

	const submit = async () => {
		const text = pasted.trim();
		if (!text || busy) return;
		setBusy(true);
		try {
			const result = await apiClient.memory.submitPromptImport.mutate({ text });
			if (result.imported > 0) {
				toast.success(
					`Импортировано: ${result.imported}. Проверь предложения выше.`,
				);
				setPasted("");
			} else {
				toast.info("Новых записей не найдено");
			}
		} catch {
			toast.error("Не удалось импортировать");
		} finally {
			setBusy(false);
		}
	};

	return (
		<section className="mb-6 rounded-lg border border-border p-4">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex w-full items-center justify-between text-left"
			>
				<div>
					<h2 className="font-medium text-foreground text-sm">
						Импорт памяти из других AI
					</h2>
					<p className="text-muted-foreground text-xs">
						Перенеси то, что о тебе помнит другой ассистент
					</p>
				</div>
				<span className="shrink-0 text-muted-foreground text-xs">
					{open ? "Скрыть" : "Открыть"}
				</span>
			</button>

			{open && (
				<div className="mt-4 space-y-4">
					<div>
						<div className="mb-1.5 flex items-center justify-between gap-2">
							<span className="text-muted-foreground text-xs">
								1. Скопируй промпт и отправь своему ассистенту
							</span>
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="h-7 shrink-0 px-2 text-xs"
								onClick={copyPrompt}
							>
								Копировать
							</Button>
						</div>
						<Textarea
							readOnly
							value={EXPORT_PROMPT}
							className="h-24 resize-none select-text text-xs"
						/>
					</div>

					<div>
						<span className="mb-1.5 block text-muted-foreground text-xs">
							2. Вставь ответ ассистента сюда
						</span>
						<Textarea
							value={pasted}
							onChange={(e) => setPasted(e.target.value)}
							placeholder="Вставь сюда список воспоминаний…"
							className="h-32 resize-none text-sm"
						/>
					</div>

					<Button
						type="button"
						size="sm"
						disabled={!pasted.trim() || busy}
						onClick={submit}
					>
						{busy ? "Импортирую…" : "Импортировать"}
					</Button>
				</div>
			)}
		</section>
	);
}
