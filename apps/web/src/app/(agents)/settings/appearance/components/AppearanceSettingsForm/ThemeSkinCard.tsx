"use client";

/**
 * ThemeSkinCard — the F08 Theme × Skin two-axis control for web.
 *
 * Two independent axes:
 *  - **Theme** (System / Dark / Light): driven by next-themes (`setTheme`),
 *    toggling the `.dark` class and the globals.css base ramp.
 *  - **Skin** (named Zed-derived palettes): driven by {@link useSkin}, layering
 *    CSS-var overrides via `data-skin`.
 *
 * They never collapse into one control: a user can run any skin under any theme,
 * matching the desktop model. The forced-dark web mock this replaces is gone.
 */

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@rox/ui/card";
import { Label } from "@rox/ui/label";
import { cn } from "@rox/ui/utils";
import { useTheme } from "next-themes";
import { useSkin } from "@/app/providers/SkinProvider";

const THEME_OPTIONS: readonly { value: string; label: string }[] = [
	{ value: "system", label: "Системная" },
	{ value: "dark", label: "Тёмная" },
	{ value: "light", label: "Светлая" },
];

/** A pill-style segmented option button. */
function OptionButton({
	selected,
	onSelect,
	children,
}: {
	selected: boolean;
	onSelect: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-pressed={selected}
			className={cn(
				"rounded-md border px-3 py-1.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
				selected
					? "border-primary bg-primary text-primary-foreground"
					: "border-border hover:border-foreground/40",
			)}
		>
			{children}
		</button>
	);
}

export function ThemeSkinCard() {
	const { theme, setTheme } = useTheme();
	const { skinId, skins, setSkin } = useSkin();

	return (
		<Card>
			<CardHeader>
				<CardTitle>Тема и скин</CardTitle>
				<CardDescription>
					Режим (системный / тёмный / светлый) и цветовой скин выбираются
					независимо.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-6">
				<div className="flex flex-col gap-2">
					<Label>Режим</Label>
					<div className="flex flex-wrap gap-2">
						{THEME_OPTIONS.map((option) => (
							<OptionButton
								key={option.value}
								selected={theme === option.value}
								onSelect={() => setTheme(option.value)}
							>
								{option.label}
							</OptionButton>
						))}
					</div>
				</div>

				<div className="flex flex-col gap-2">
					<Label>Скин</Label>
					<div className="flex flex-wrap gap-2">
						{skins.map((skin) => (
							<OptionButton
								key={skin.id}
								selected={skinId === skin.id}
								onSelect={() => setSkin(skin.id)}
							>
								{skin.name}
							</OptionButton>
						))}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
