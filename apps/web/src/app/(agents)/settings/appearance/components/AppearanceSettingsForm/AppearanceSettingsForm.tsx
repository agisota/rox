"use client";

/**
 * AppearanceSettingsForm — local appearance controls for web (variant 2a).
 *
 * Wires the {@link useAppearance} setter to wallpaper, glass, and quote-loader
 * controls. All state is local-only (persisted to localStorage by the
 * provider); there is no DB/Electric sync on web.
 */

import {
	MAX_WINDOW_OPACITY,
	MIN_WINDOW_OPACITY,
	WALLPAPERS,
	type Wallpaper,
} from "@rox/shared/appearance";
import { Button } from "@rox/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@rox/ui/card";
import { Label } from "@rox/ui/label";
import { MeshGradient } from "@rox/ui/mesh-gradient";
import { Slider } from "@rox/ui/slider";
import { Switch } from "@rox/ui/switch";
import { cn } from "@rox/ui/utils";
import { useAppearance } from "@/app/providers/AppearanceProvider";
import { ThemeSkinCard } from "./ThemeSkinCard";

/** Rotation interval presets (seconds) offered for auto-rotate. */
const ROTATE_PRESETS: readonly { label: string; seconds: number }[] = [
	{ label: "30 с", seconds: 30 },
	{ label: "1 мин", seconds: 60 },
	{ label: "2 мин", seconds: 120 },
	{ label: "5 мин", seconds: 300 },
];

/** A single wallpaper preview tile in the selection grid. */
function WallpaperTile({
	wallpaper,
	selected,
	onSelect,
}: {
	wallpaper: Wallpaper;
	selected: boolean;
	onSelect: () => void;
}) {
	const colors =
		wallpaper.source.kind === "gradient" ? wallpaper.source.colors : undefined;
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={selected}
			className={cn(
				"relative h-20 overflow-hidden rounded-lg border-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
				selected
					? "border-primary"
					: "border-border hover:border-foreground/40",
			)}
		>
			{colors ? (
				<MeshGradient colors={colors} className="h-full w-full" />
			) : (
				<div className="h-full w-full bg-muted" />
			)}
			<span className="absolute inset-x-0 bottom-0 bg-background/70 px-2 py-1 text-xs text-foreground">
				{wallpaper.name}
			</span>
		</button>
	);
}

/** The full appearance settings form. */
export function AppearanceSettingsForm() {
	const { settings, setSettings } = useAppearance();
	const wallpaperEnabled = settings.wallpaperId !== null;

	return (
		<div className="flex flex-col gap-6">
			<ThemeSkinCard />

			<Card>
				<CardHeader>
					<CardTitle>Обои</CardTitle>
					<CardDescription>
						Фоновое изображение под интерфейсом. Хранится локально в этом
						браузере.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-5">
					<div className="flex items-center justify-between gap-4">
						<Label htmlFor="wallpaper-enabled">Показывать обои</Label>
						<Switch
							id="wallpaper-enabled"
							checked={wallpaperEnabled}
							onCheckedChange={(checked) =>
								setSettings((prev) => ({
									...prev,
									wallpaperId: checked
										? (prev.wallpaperId ?? WALLPAPERS[0]?.id ?? null)
										: null,
								}))
							}
						/>
					</div>

					{wallpaperEnabled ? (
						<>
							<div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
								{WALLPAPERS.map((wallpaper) => (
									<WallpaperTile
										key={wallpaper.id}
										wallpaper={wallpaper}
										selected={settings.wallpaperId === wallpaper.id}
										onSelect={() =>
											setSettings((prev) => ({
												...prev,
												wallpaperId: wallpaper.id,
											}))
										}
									/>
								))}
							</div>

							<div className="flex items-center justify-between gap-4">
								<Label htmlFor="wallpaper-rotate">
									Автоматически менять обои
								</Label>
								<Switch
									id="wallpaper-rotate"
									checked={settings.wallpaperAutoRotate}
									onCheckedChange={(checked) =>
										setSettings((prev) => ({
											...prev,
											wallpaperAutoRotate: checked,
										}))
									}
								/>
							</div>

							{settings.wallpaperAutoRotate ? (
								<div className="flex flex-col gap-2">
									<Label>Интервал смены</Label>
									<div className="flex flex-wrap gap-2">
										{ROTATE_PRESETS.map((preset) => (
											<Button
												key={preset.seconds}
												type="button"
												size="sm"
												variant={
													settings.wallpaperRotateSeconds === preset.seconds
														? "default"
														: "outline"
												}
												onClick={() =>
													setSettings((prev) => ({
														...prev,
														wallpaperRotateSeconds: preset.seconds,
													}))
												}
											>
												{preset.label}
											</Button>
										))}
									</div>
								</div>
							) : null}
						</>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Стеклянная тема</CardTitle>
					<CardDescription>
						Полупрозрачные поверхности, сквозь которые видны обои.
					</CardDescription>
				</CardHeader>
				<CardContent className="flex flex-col gap-5">
					<div className="flex items-center justify-between gap-4">
						<Label htmlFor="glass-enabled">Включить стекло</Label>
						<Switch
							id="glass-enabled"
							checked={settings.glassEnabled}
							onCheckedChange={(checked) =>
								setSettings((prev) => ({
									...prev,
									glassEnabled: checked,
								}))
							}
						/>
					</div>

					{settings.glassEnabled ? (
						<div className="flex flex-col gap-2">
							<div className="flex items-center justify-between">
								<Label htmlFor="glass-opacity">
									Непрозрачность поверхностей
								</Label>
								<span className="text-sm text-muted-foreground tabular-nums">
									{Math.round(settings.windowOpacity * 100)}%
								</span>
							</div>
							<Slider
								id="glass-opacity"
								min={MIN_WINDOW_OPACITY}
								max={MAX_WINDOW_OPACITY}
								step={0.05}
								value={[settings.windowOpacity]}
								onValueChange={(value) =>
									setSettings((prev) => ({
										...prev,
										windowOpacity: value[0] ?? prev.windowOpacity,
									}))
								}
							/>
						</div>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Экран ожидания</CardTitle>
					<CardDescription>
						Показывать мотивационные цитаты вместо обычного спиннера при
						загрузке.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-between gap-4">
						<Label htmlFor="quote-loader">Экран с цитатами</Label>
						<Switch
							id="quote-loader"
							checked={settings.quoteLoaderEnabled}
							onCheckedChange={(checked) =>
								setSettings((prev) => ({
									...prev,
									quoteLoaderEnabled: checked,
								}))
							}
						/>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
