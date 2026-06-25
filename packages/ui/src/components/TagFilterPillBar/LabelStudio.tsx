"use client";

import {
	LABEL_EMOJI,
	LABEL_LUCIDE_ICONS,
	LABEL_SWATCHES,
	lucideIconToken,
	resolveLabelColor,
} from "@rox/shared/label-style";
import { Check } from "lucide-react";
import { type ReactNode, useState } from "react";

import { cn } from "../../lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "../popover";
import { Button } from "../ui/button";
import { LabelIconGlyph } from "./LabelIconGlyph";
import type { TagLabel } from "./tag-filter";

export interface LabelStudioProps {
	/** The label being styled; seeds the draft colour/icon and the preview name. */
	label: TagLabel;
	/** The trigger element (the label pill); the studio opens on click. */
	children: ReactNode;
	/** Persist the chosen colour (`chatLabels.update({ color })`). */
	onRecolor: (color: string) => void;
	/**
	 * Persist the chosen icon (`chatLabels.update({ icon })`); `null` clears it.
	 * Optional — when absent the icon picker is hidden (colour-only studio).
	 */
	onSetIcon?: (icon: string | null) => void;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

/**
 * The colour/icon studio popover for a single org chat label (Hermes-borrow
 * F11). Shows a live pill preview, an 8-swatch palette row, and an emoji/Lucide
 * icon picker; Save commits the draft `(colour, icon)` via the callbacks. All
 * presentation comes from `@rox/shared/label-style`, so a swatch is the same
 * colour on web, desktop, and mobile — the platform owns only the tRPC wiring.
 *
 * Draft state is local: nothing mutates until Save, so the preview is free to
 * update in real time without round-tripping the server.
 */
export function LabelStudio({
	label,
	children,
	onRecolor,
	onSetIcon,
	open,
	onOpenChange,
}: LabelStudioProps) {
	const [draftColor, setDraftColor] = useState(() =>
		resolveLabelColor(label.color, label.name),
	);
	// `undefined` while untouched means "keep the saved icon"; a value (including
	// `null`) means the user changed it and Save should persist exactly that.
	const [draftIcon, setDraftIcon] = useState<string | null | undefined>(
		undefined,
	);

	const previewIcon =
		draftIcon === undefined ? (label.icon ?? null) : draftIcon;

	const save = () => {
		const resolved = resolveLabelColor(label.color, label.name);
		if (draftColor !== resolved) {
			onRecolor(draftColor);
		}
		if (onSetIcon && draftIcon !== undefined && draftIcon !== label.icon) {
			onSetIcon(draftIcon);
		}
		onOpenChange?.(false);
	};

	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>{children}</PopoverTrigger>
			<PopoverContent align="start" className="w-64 space-y-3 p-3">
				{/* Live preview pill — reflects the draft colour and icon instantly. */}
				<div className="flex items-center justify-between">
					<span className="text-xs font-medium text-muted-foreground">
						Preview
					</span>
					<span
						className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
						style={{ backgroundColor: draftColor, color: "hsl(0, 0%, 100%)" }}
					>
						<LabelIconGlyph icon={previewIcon} className="size-3" />
						{!previewIcon && (
							<span aria-hidden className="size-1.5 rounded-full bg-white/80" />
						)}
						{label.name}
					</span>
				</div>

				{/* 8-swatch palette row. */}
				<div className="space-y-1.5">
					<p className="text-xs font-medium text-muted-foreground">Colour</p>
					<div className="flex flex-wrap gap-1.5">
						{LABEL_SWATCHES.map((swatch) => {
							const active = swatch === draftColor;
							return (
								<button
									key={swatch}
									type="button"
									aria-label={`Colour ${swatch}`}
									aria-pressed={active}
									onClick={() => setDraftColor(swatch)}
									className={cn(
										"flex size-6 items-center justify-center rounded-full transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
										active &&
											"ring-2 ring-ring ring-offset-1 ring-offset-background",
									)}
									style={{ backgroundColor: swatch }}
								>
									{active && (
										<Check aria-hidden className="size-3 text-white" />
									)}
								</button>
							);
						})}
					</div>
				</div>

				{/* Icon picker — emoji + curated Lucide glyphs, plus a "no icon" option. */}
				{onSetIcon && (
					<div className="space-y-1.5">
						<p className="text-xs font-medium text-muted-foreground">Icon</p>
						<div className="flex flex-wrap gap-1">
							<IconChoice
								active={!previewIcon}
								onSelect={() => setDraftIcon(null)}
								label="No icon"
							>
								<span className="text-muted-foreground">∅</span>
							</IconChoice>
							{LABEL_EMOJI.map((emoji) => (
								<IconChoice
									key={emoji}
									active={previewIcon === emoji}
									onSelect={() => setDraftIcon(emoji)}
									label={`Emoji ${emoji}`}
								>
									<span>{emoji}</span>
								</IconChoice>
							))}
							{LABEL_LUCIDE_ICONS.map((name) => {
								const token = lucideIconToken(name);
								return (
									<IconChoice
										key={name}
										active={previewIcon === token}
										onSelect={() => setDraftIcon(token)}
										label={`Icon ${name}`}
									>
										<LabelIconGlyph icon={token} className="size-4" />
									</IconChoice>
								);
							})}
						</div>
					</div>
				)}

				<div className="flex justify-end gap-2 pt-1">
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => onOpenChange?.(false)}
					>
						Cancel
					</Button>
					<Button type="button" size="sm" onClick={save}>
						Save
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	);
}

/** A single square icon-picker cell with an active ring. */
function IconChoice({
	active,
	onSelect,
	label,
	children,
}: {
	active: boolean;
	onSelect: () => void;
	label: string;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			aria-label={label}
			aria-pressed={active}
			onClick={onSelect}
			className={cn(
				"flex size-7 items-center justify-center rounded-md text-base transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
				active && "bg-accent text-accent-foreground",
			)}
		>
			{children}
		</button>
	);
}
