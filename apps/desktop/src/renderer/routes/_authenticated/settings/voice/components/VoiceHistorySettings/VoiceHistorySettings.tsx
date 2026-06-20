import { Skeleton } from "@rox/ui/skeleton";
import { useEffect, useState } from "react";
import { apiClient } from "renderer/routes/_authenticated/providers/CollectionsProvider/collections";

type VoiceItem = Awaited<
	ReturnType<typeof apiClient.voice.listHistory.query>
>[number];

/**
 * Settings → Voice: the signed-in user's dictation history (raw transcript +
 * post-processed RU/EN, detected language, timestamp). Read-only.
 */
export function VoiceHistorySettings() {
	const [items, setItems] = useState<VoiceItem[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let active = true;
		apiClient.voice.listHistory
			.query({ limit: 100 })
			.then((rows) => {
				if (active) setItems(rows);
			})
			.catch(() => {})
			.finally(() => {
				if (active) setLoading(false);
			});
		return () => {
			active = false;
		};
	}, []);

	return (
		<div>
			<header className="mb-6">
				<h2 className="font-semibold text-foreground text-lg">История</h2>
				<p className="mt-1 text-muted-foreground text-sm">
					Надиктованные промпты и их расшифровки.
				</p>
			</header>

			{loading ? (
				<div className="space-y-3">
					{[0, 1, 2].map((i) => (
						<Skeleton key={i} className="h-16 w-full" />
					))}
				</div>
			) : items.length === 0 ? (
				<div className="flex flex-col items-center justify-center rounded-lg border border-border border-dashed py-16 text-center">
					<span className="text-foreground text-sm">
						Пока ничего не надиктовано
					</span>
					<span className="mt-1 max-w-sm text-muted-foreground text-xs">
						Нажмите на микрофон в поле ввода или используйте сочетание клавиш,
						чтобы продиктовать промпт.
					</span>
				</div>
			) : (
				<div className="space-y-3">
					{items.map((item) => (
						<div key={item.id} className="rounded-lg border border-border p-3">
							<div className="mb-1.5 flex items-center gap-2 text-muted-foreground text-xs">
								<span>{new Date(item.createdAt).toLocaleString("ru-RU")}</span>
								{item.language && (
									<span className="rounded bg-muted px-1.5 py-0.5 uppercase">
										{item.language}
									</span>
								)}
							</div>
							{item.rawText && (
								<p className="select-text text-foreground text-sm leading-snug">
									{item.rawText}
								</p>
							)}
							{item.processedRu && item.processedRu !== item.rawText && (
								<p className="mt-1.5 select-text border-primary/40 border-l-2 pl-2 text-muted-foreground text-xs leading-snug">
									{item.processedRu}
								</p>
							)}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
