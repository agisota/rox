import { WALLPAPERS } from "@rox/shared/appearance";
import { Label } from "@rox/ui/label";
import { Slider } from "@rox/ui/slider";
import { Switch } from "@rox/ui/switch";
import { cn } from "@rox/ui/utils";
import { CheckIcon } from "lucide-react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useWallpaperStore } from "renderer/stores/wallpaper";
import { SettingsCard } from "../../../../../components/SettingsCard";
import { SETTING_ITEM_ID } from "../../../../../utils/settings-search";
import {
	DEFAULT_ROTATE_SECONDS,
	formatRotateInterval,
	MAX_ROTATE_SECONDS,
	MIN_ROTATE_SECONDS,
	previewBackground,
} from "./wallpaper-section.utils";

/**
 * Wallpaper appearance controls (custom-loading-screens epic).
 *
 * Toggles the wallpaper background on/off, offers a preview grid to pick one,
 * and exposes the auto-rotate toggle + rotation interval. Persistence goes
 * through the `window.setAppearance` tRPC mutation; the live wallpaper store is
 * updated in lockstep so the background reacts immediately.
 */
export function WallpaperSection() {
	const utils = electronTrpc.useUtils();
	const { data: appearance } = electronTrpc.window.getAppearance.useQuery();
	const applyToStore = useWallpaperStore((s) => s.applySettings);

	const setAppearance = electronTrpc.window.setAppearance.useMutation({
		onSettled: () => {
			utils.window.getAppearance.invalidate();
		},
	});

	const wallpaperId = appearance?.wallpaperId ?? null;
	const autoRotate = appearance?.wallpaperAutoRotate ?? true;
	const rotateSeconds =
		appearance?.wallpaperRotateSeconds ?? DEFAULT_ROTATE_SECONDS;
	const enabled = wallpaperId !== null;

	const resolvePatch = (patch: {
		wallpaperId?: string | null;
		wallpaperAutoRotate?: boolean;
		wallpaperRotateSeconds?: number;
	}) => ({
		wallpaperId:
			patch.wallpaperId !== undefined ? patch.wallpaperId : wallpaperId,
		wallpaperAutoRotate:
			patch.wallpaperAutoRotate !== undefined
				? patch.wallpaperAutoRotate
				: autoRotate,
		wallpaperRotateSeconds:
			patch.wallpaperRotateSeconds !== undefined
				? patch.wallpaperRotateSeconds
				: rotateSeconds,
	});

	/** Mirror wallpaper-driving fields into query cache + live store. */
	const mirrorSettings = (next: {
		wallpaperId: string | null;
		wallpaperAutoRotate: boolean;
		wallpaperRotateSeconds: number;
	}) => {
		utils.window.getAppearance.setData(undefined, (prev) =>
			prev ? { ...prev, ...next } : prev,
		);
		applyToStore(next);
	};

	/** Persist a patch and mirror the wallpaper-driving fields into the store. */
	const persist = (patch: {
		wallpaperId?: string | null;
		wallpaperAutoRotate?: boolean;
		wallpaperRotateSeconds?: number;
	}) => {
		mirrorSettings(resolvePatch(patch));
		setAppearance.mutate(patch);
	};

	const preview = (patch: {
		wallpaperId?: string | null;
		wallpaperAutoRotate?: boolean;
		wallpaperRotateSeconds?: number;
	}) => {
		mirrorSettings(resolvePatch(patch));
	};

	const handleToggle = (on: boolean) => {
		// Turning on selects the first wallpaper; turning off clears the id.
		persist({ wallpaperId: on ? (WALLPAPERS[0]?.id ?? null) : null });
	};

	const handleSelect = (id: string) => {
		persist({ wallpaperId: id });
	};

	const handleAutoRotate = (on: boolean) => {
		persist({ wallpaperAutoRotate: on });
	};

	const handleInterval = (values: number[]) => {
		const next = values[0];
		if (next === undefined) return;
		preview({ wallpaperRotateSeconds: next });
	};

	const handleIntervalCommit = (values: number[]) => {
		const next = values[0];
		if (next === undefined) return;
		persist({ wallpaperRotateSeconds: next });
	};

	return (
		<SettingsCard bare anchorItemId={SETTING_ITEM_ID.APPEARANCE_WALLPAPER}>
			<div className="divide-y divide-border/60">
				<div className="flex items-center justify-between gap-6 p-4">
					<div className="min-w-0 flex-1">
						<Label htmlFor="wallpaper-enabled" className="text-sm font-medium">
							Обои
						</Label>
						<div className="text-xs text-muted-foreground">
							Фоновое изображение, просвечивающее сквозь стеклянные поверхности.
						</div>
					</div>
					<Switch
						id="wallpaper-enabled"
						checked={enabled}
						onCheckedChange={handleToggle}
					/>
				</div>

				{enabled ? (
					<>
						<div className="p-4">
							<div className="mb-3 text-sm font-medium">Выбор обоев</div>
							<div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
								{WALLPAPERS.map((wallpaper) => {
									const isSelected = wallpaper.id === wallpaperId;
									return (
										<button
											key={wallpaper.id}
											type="button"
											aria-label={wallpaper.name}
											aria-pressed={isSelected}
											onClick={() => handleSelect(wallpaper.id)}
											className={cn(
												"group relative aspect-video overflow-hidden rounded-md border transition-colors",
												isSelected
													? "border-primary ring-2 ring-primary"
													: "border-border hover:border-muted-foreground",
											)}
										>
											<span
												aria-hidden
												className="absolute inset-0"
												style={{
													background: previewBackground(wallpaper.source),
												}}
											/>
											{isSelected ? (
												<span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
													<CheckIcon className="size-3" />
												</span>
											) : null}
											<span className="absolute inset-x-0 bottom-0 truncate bg-black/40 px-1.5 py-0.5 text-[10px] text-white">
												{wallpaper.name}
											</span>
										</button>
									);
								})}
							</div>
						</div>

						<div className="flex items-center justify-between gap-6 p-4">
							<div className="min-w-0 flex-1">
								<Label
									htmlFor="wallpaper-auto-rotate"
									className="text-sm font-medium"
								>
									Авто-смена
								</Label>
								<div className="text-xs text-muted-foreground">
									Периодически менять обои на другие из набора.
								</div>
							</div>
							<Switch
								id="wallpaper-auto-rotate"
								checked={autoRotate}
								onCheckedChange={handleAutoRotate}
							/>
						</div>

						{autoRotate ? (
							<div className="flex items-center justify-between gap-6 p-4">
								<div className="min-w-0 flex-1">
									<div className="text-sm font-medium">Интервал смены</div>
									<div className="text-xs text-muted-foreground">
										Как часто меняются обои (
										{formatRotateInterval(rotateSeconds)}
										).
									</div>
								</div>
								<Slider
									aria-label="Интервал смены обоев"
									className="w-44"
									min={MIN_ROTATE_SECONDS}
									max={MAX_ROTATE_SECONDS}
									step={30}
									value={[rotateSeconds]}
									onValueChange={handleInterval}
									onValueCommit={handleIntervalCommit}
								/>
							</div>
						) : null}
					</>
				) : null}
			</div>
		</SettingsCard>
	);
}
