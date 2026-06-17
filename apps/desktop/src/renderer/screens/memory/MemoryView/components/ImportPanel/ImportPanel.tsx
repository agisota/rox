import type { SelectMemoryImportJob } from "@rox/db/schema";
import { Button } from "@rox/ui/button";
import { toast } from "@rox/ui/sonner";
import { Textarea } from "@rox/ui/textarea";
import { cn } from "@rox/ui/utils";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo, useState } from "react";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { apiClient } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";

const EXPORT_PROMPT = `Выгрузи всё, что ты помнишь обо мне, одним списком по категориям. Используй ровно эти заголовки категорий: Instructions, Identity, Career, Projects, Preferences. Под каждым заголовком — по одной записи на строку в формате:
[YYYY-MM-DD] - текст записи
Ничего не добавляй сверх этого списка.`;

const MAX_ARCHIVE_BYTES = 8_000_000;

const JOB_STATUS_LABEL: Record<SelectMemoryImportJob["status"], string> = {
	pending: "В очереди…",
	processing: "Обрабатываю архив…",
	done: "Готово",
	failed: "Ошибка",
};

/**
 * Import-from-other-AI panel with two mechanisms: a copyable export prompt +
 * paste box (parsed server-side into suggestions), and a chat-export archive
 * upload (stored on Blob, parsed + R1-classified into suggestions). Both surface
 * results in the Approve/Decline banner above the groups.
 */
export function ImportPanel() {
	const collections = useCollections();
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id ?? "";

	const [open, setOpen] = useState(false);
	const [pasted, setPasted] = useState("");
	const [busy, setBusy] = useState(false);
	const [provider, setProvider] = useState<"chatgpt" | "anthropic">("chatgpt");
	const [archiveBusy, setArchiveBusy] = useState(false);

	const { data: jobs = [] } = useLiveQuery(
		(q) =>
			q
				.from({ jobs: collections.memoryImportJobs })
				.where(({ jobs }) => eq(jobs.createdBy, userId)),
		[collections, userId],
	);
	const latestJob = useMemo(
		() =>
			[...jobs].sort((a, b) =>
				a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
			)[0],
		[jobs],
	);

	const copyPrompt = async () => {
		try {
			await navigator.clipboard.writeText(EXPORT_PROMPT);
			toast.success("Промпт скопирован");
		} catch {
			toast.error("Не удалось скопировать");
		}
	};

	const submitPrompt = async () => {
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

	const onArchiveFile = async (file: File | undefined) => {
		if (!file || archiveBusy) return;
		if (file.size > MAX_ARCHIVE_BYTES) {
			toast.error("Файл слишком большой (максимум 8 МБ)");
			return;
		}
		setArchiveBusy(true);
		try {
			const content = await file.text();
			await apiClient.memory.startArchiveImport.mutate({ provider, content });
			toast.success("Архив загружен — идёт обработка");
		} catch {
			toast.error("Не удалось загрузить архив");
		} finally {
			setArchiveBusy(false);
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
				<div className="mt-4 space-y-6">
					{/* Mechanism 1 — prompt import */}
					<div className="space-y-3">
						<div className="flex items-center justify-between gap-2">
							<span className="font-medium text-foreground text-xs">
								Через промпт
							</span>
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="h-7 shrink-0 px-2 text-xs"
								onClick={copyPrompt}
							>
								Копировать промпт
							</Button>
						</div>
						<Textarea
							readOnly
							value={EXPORT_PROMPT}
							className="h-20 resize-none select-text text-xs"
						/>
						<Textarea
							value={pasted}
							onChange={(e) => setPasted(e.target.value)}
							placeholder="Вставь сюда ответ ассистента…"
							className="h-28 resize-none text-sm"
						/>
						<Button
							type="button"
							size="sm"
							disabled={!pasted.trim() || busy}
							onClick={submitPrompt}
						>
							{busy ? "Импортирую…" : "Импортировать из текста"}
						</Button>
					</div>

					<div className="border-border border-t" />

					{/* Mechanism 2 — archive upload */}
					<div className="space-y-3">
						<span className="font-medium text-foreground text-xs">
							Через архив выгрузки
						</span>
						<div className="flex gap-1.5">
							{(["chatgpt", "anthropic"] as const).map((p) => (
								<button
									key={p}
									type="button"
									onClick={() => setProvider(p)}
									className={cn(
										"rounded-md border px-2.5 py-1 text-xs transition-colors",
										provider === p
											? "border-primary bg-primary/10 text-foreground"
											: "border-border text-muted-foreground hover:bg-accent/50",
									)}
								>
									{p === "chatgpt" ? "ChatGPT" : "Anthropic"}
								</button>
							))}
						</div>
						<label
							className={cn(
								"flex cursor-pointer items-center justify-center rounded-md border border-border border-dashed px-3 py-4 text-center text-muted-foreground text-xs transition-colors hover:bg-accent/40",
								archiveBusy && "pointer-events-none opacity-60",
							)}
						>
							<input
								type="file"
								accept=".json,application/json"
								className="hidden"
								disabled={archiveBusy}
								onChange={(e) => onArchiveFile(e.target.files?.[0])}
							/>
							{archiveBusy
								? "Загружаю…"
								: "Выбери файл conversations.json из выгрузки"}
						</label>
						{latestJob && (
							<p
								className={cn(
									"text-xs",
									latestJob.status === "failed"
										? "text-destructive"
										: "text-muted-foreground",
								)}
							>
								{JOB_STATUS_LABEL[latestJob.status]}
								{latestJob.status === "done" &&
									typeof latestJob.stats?.imported === "number" &&
									` — найдено ${latestJob.stats.imported}, проверь предложения выше`}
							</p>
						)}
					</div>
				</div>
			)}
		</section>
	);
}
