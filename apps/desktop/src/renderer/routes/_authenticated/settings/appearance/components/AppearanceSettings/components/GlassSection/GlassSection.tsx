import { Label } from "@rox/ui/label";
import { Slider } from "@rox/ui/slider";
import { Switch } from "@rox/ui/switch";
import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	applyAppearanceGlass,
	DEFAULT_GLASS_WINDOW_OPACITY,
	formatOpacityPercent,
	MAX_WINDOW_OPACITY,
	MIN_WINDOW_OPACITY,
} from "./appearance-settings.utils";

/**
 * Glass / vibrancy appearance controls (themes-fonts epic).
 *
 * Toggles translucent glass surfaces and the window-opacity used for them.
 * Persistence + live native window vibrancy is handled by the `window.setGlass`
 * tRPC procedure; the `.glass` document-root class + CSS variables are applied
 * locally so surfaces react immediately.
 */
export function GlassSection() {
	const utils = electronTrpc.useUtils();
	const { data: appearance } = electronTrpc.window.getAppearance.useQuery();
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();

	const setGlass = electronTrpc.window.setGlass.useMutation({
		onMutate: async (input) => {
			await utils.window.getAppearance.cancel();
			const previous = utils.window.getAppearance.getData();
			utils.window.getAppearance.setData(undefined, input);
			applyAppearanceGlass(input);
			return { previous };
		},
		onError: (_err, _vars, context) => {
			if (context?.previous) {
				utils.window.getAppearance.setData(undefined, context.previous);
				applyAppearanceGlass(context.previous);
			}
		},
		onSettled: () => {
			utils.window.getAppearance.invalidate();
		},
	});

	const glassEnabled = appearance?.glassEnabled ?? true;
	const windowOpacity =
		appearance?.windowOpacity ?? DEFAULT_GLASS_WINDOW_OPACITY;
	const isMac = platform === "darwin";

	// Keep the document in sync with the persisted state on mount / external change.
	useEffect(() => {
		if (appearance) {
			applyAppearanceGlass(appearance);
		}
	}, [appearance]);

	const handleToggle = (enabled: boolean) => {
		setGlass.mutate({ glassEnabled: enabled, windowOpacity });
	};

	const handleOpacityChange = (values: number[]) => {
		const next = values[0];
		if (next === undefined) return;
		setGlass.mutate({ glassEnabled, windowOpacity: next });
	};

	return (
		<div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
			<div className="flex items-center justify-between gap-6 p-4">
				<div className="min-w-0 flex-1">
					<Label htmlFor="glass-enabled" className="text-sm font-medium">
						Стеклянные поверхности
					</Label>
					<div className="text-xs text-muted-foreground">
						Сделать панели полупрозрачными с размытым фоном.
						{!isMac
							? " Нативная прозрачность окна доступна только на macOS."
							: null}
					</div>
				</div>
				<Switch
					id="glass-enabled"
					checked={glassEnabled}
					onCheckedChange={handleToggle}
				/>
			</div>

			{glassEnabled ? (
				<div className="flex items-center justify-between gap-6 p-4">
					<div className="min-w-0 flex-1">
						<div className="text-sm font-medium">Непрозрачность окна</div>
						<div className="text-xs text-muted-foreground">
							Насколько плотными выглядят стеклянные поверхности (
							{formatOpacityPercent(windowOpacity)}
							).
						</div>
					</div>
					<Slider
						aria-label="Непрозрачность окна"
						className="w-44"
						min={MIN_WINDOW_OPACITY}
						max={MAX_WINDOW_OPACITY}
						step={0.01}
						value={[windowOpacity]}
						onValueChange={handleOpacityChange}
					/>
				</div>
			) : null}
		</div>
	);
}
