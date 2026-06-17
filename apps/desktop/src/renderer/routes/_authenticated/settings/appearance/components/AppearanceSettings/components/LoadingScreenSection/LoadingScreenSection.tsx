import { QUOTES } from "@rox/shared/appearance";
import { Label } from "@rox/ui/label";
import { Switch } from "@rox/ui/switch";
import { electronTrpc } from "renderer/lib/electron-trpc";

/** Representative quote used for the static settings preview. */
const PREVIEW_QUOTE = QUOTES[0];

/**
 * Loading-screen appearance controls (custom-loading-screens epic).
 *
 * Toggles the motivational quote loading screen shown during long route
 * transitions, with a small static preview of how a quote card reads.
 * Persistence goes through the `window.setAppearance` tRPC mutation.
 */
export function LoadingScreenSection() {
	const utils = electronTrpc.useUtils();
	const { data: appearance } = electronTrpc.window.getAppearance.useQuery();

	const setAppearance = electronTrpc.window.setAppearance.useMutation({
		onMutate: async (input) => {
			await utils.window.getAppearance.cancel();
			const previous = utils.window.getAppearance.getData();
			utils.window.getAppearance.setData(undefined, (prev) =>
				prev ? { ...prev, ...input } : prev,
			);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				utils.window.getAppearance.setData(undefined, context.previous);
			}
		},
		onSettled: () => {
			utils.window.getAppearance.invalidate();
		},
	});

	const quoteLoaderEnabled = appearance?.quoteLoaderEnabled ?? true;

	const handleToggle = (enabled: boolean) => {
		setAppearance.mutate({ quoteLoaderEnabled: enabled });
	};

	return (
		<div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
			<div className="flex items-center justify-between gap-6 p-4">
				<div className="min-w-0 flex-1">
					<Label htmlFor="quote-loader-enabled" className="text-sm font-medium">
						Экран ожидания с цитатой
					</Label>
					<div className="text-xs text-muted-foreground">
						Показывать мотивационную цитату вместо спиннера при долгих
						переходах.
					</div>
				</div>
				<Switch
					id="quote-loader-enabled"
					checked={quoteLoaderEnabled}
					onCheckedChange={handleToggle}
				/>
			</div>

			{quoteLoaderEnabled && PREVIEW_QUOTE ? (
				<div className="p-4">
					<div className="mb-3 text-sm font-medium">Предпросмотр</div>
					<div className="relative flex aspect-[16/6] items-center overflow-hidden rounded-md bg-gradient-to-r from-background via-background/80 to-muted px-6">
						<blockquote className="max-w-md">
							<p className="text-pretty font-semibold text-lg text-foreground leading-tight tracking-tight">
								{PREVIEW_QUOTE.text}
							</p>
							{PREVIEW_QUOTE.author ? (
								<cite className="mt-2 block text-xs text-muted-foreground not-italic">
									— {PREVIEW_QUOTE.author}
								</cite>
							) : null}
						</blockquote>
					</div>
				</div>
			) : null}
		</div>
	);
}
