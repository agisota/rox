import { cn } from "@rox/ui/utils";
import type { ReactNode } from "react";

/**
 * Shared glass settings primitive (Settings P0 hardening).
 *
 * Replaces the three ad-hoc card shapes that previously drifted across the
 * settings surface:
 *  - `appearance/.../GlassSection` (rounded-lg border + divide-y rows)
 *  - `models/.../SettingsSection` (labelled section header)
 *  - `account/.../AccountSettings` inline `SettingRow`
 *
 * Glass behaviour is delegated to the shared `.glass-panel` utility from
 * `@rox/ui/globals.css`: when the document root carries `.glass` the panel
 * background becomes `color-mix(--card, --surface-opacity)` with a backdrop
 * blur + specular edge; when glass is off the same class resolves to a solid
 * `--card` fill, matching the explicit `bg-card` fallback below. This keeps a
 * single source of truth for the liquid-glass look (no per-component CSS) and
 * needs zero edits to the shared stylesheet.
 *
 * All monospace values (model IDs, Base URLs, API-key env names, branch
 * prefixes, paths, accelerators) should render through {@link MonoValue} so the
 * Victor Mono treatment is uniform across every section.
 */
interface SettingsCardProps {
	/** Stacked rows (typically {@link SettingsRow}); separated by hairlines. */
	children: ReactNode;
	/** Optional header rendered above the divided body. */
	header?: ReactNode;
	className?: string;
	/**
	 * When true (default) the body rows are separated by `divide-y` hairlines.
	 * Set to false for a single free-form body (e.g. a slider group).
	 */
	divided?: boolean;
	/**
	 * Render children directly with no inner padding/divider wrapper. Use when
	 * the children already supply their own padded rows + separators (lets a
	 * pre-existing section drop onto the glass panel unchanged). When `bare`,
	 * the `divided` prop is ignored.
	 */
	bare?: boolean;
}

export function SettingsCard({
	children,
	header,
	className,
	divided = true,
	bare = false,
}: SettingsCardProps) {
	return (
		<div
			className={cn(
				// Solid fallback (glass off / non-mac) + shared glass-panel hook.
				"glass-panel overflow-hidden rounded-lg border border-border/60 bg-card text-card-foreground",
				className,
			)}
		>
			{header}
			{bare ? (
				children
			) : (
				<div className={cn("px-4", divided && "divide-y divide-border/60")}>
					{children}
				</div>
			)}
		</div>
	);
}

interface SettingsCardHeaderProps {
	title: ReactNode;
	icon?: ReactNode;
	description?: ReactNode;
	action?: ReactNode;
	/** Anchor id so the command palette can deep-link + flash this card (P1). */
	id?: string;
	className?: string;
}

/**
 * Header band for a {@link SettingsCard}: title (+ optional icon) and an
 * optional right-aligned action, with an optional muted description below.
 * Mirrors the old Models `SettingsSection` header API so existing call sites
 * migrate without prop changes.
 */
export function SettingsCardHeader({
	title,
	icon,
	description,
	action,
	id,
	className,
}: SettingsCardHeaderProps) {
	return (
		<div
			id={id}
			className={cn(
				"flex items-start justify-between gap-4 border-b border-border/60 px-4 py-3",
				className,
			)}
		>
			<div className="min-w-0">
				<h3 className="flex items-center gap-2 text-sm font-medium">
					{icon}
					{title}
				</h3>
				{description ? (
					<p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
				) : null}
			</div>
			{action ? <div className="shrink-0">{action}</div> : null}
		</div>
	);
}

interface SettingsRowProps {
	label: ReactNode;
	hint?: ReactNode;
	htmlFor?: string;
	/** The control (switch / slider / input / button) shown on the right. */
	children: ReactNode;
	className?: string;
	/** Stack the control under the label (for wide controls like sliders). */
	stacked?: boolean;
}

/**
 * One label+hint (left) / control (right) row inside a {@link SettingsCard}.
 * The label is a plain element (callers pass a `<Label htmlFor>` when wiring a
 * form control needs it) to keep this primitive dependency-light and reusable
 * across every section.
 */
export function SettingsRow({
	label,
	hint,
	htmlFor,
	children,
	className,
	stacked = false,
}: SettingsRowProps) {
	return (
		<div
			className={cn(
				stacked
					? "flex flex-col gap-3 py-3.5"
					: "flex items-center justify-between gap-8 py-3.5",
				className,
			)}
		>
			<div className="min-w-0 flex-1">
				{htmlFor ? (
					<label htmlFor={htmlFor} className="text-sm font-medium leading-none">
						{label}
					</label>
				) : (
					<div className="text-sm font-medium leading-none">{label}</div>
				)}
				{hint ? (
					<div className="mt-1 text-xs text-muted-foreground">{hint}</div>
				) : null}
			</div>
			<div className={cn(stacked ? "w-full" : "shrink-0")}>{children}</div>
		</div>
	);
}

/**
 * Inline Victor-Mono value (model IDs, Base URLs, env names, paths, branch
 * prefixes, keyboard accelerators). Centralises the mono treatment so every
 * code-token in settings reads consistently.
 */
export function MonoValue({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"font-mono text-xs text-muted-foreground tabular-nums",
				className,
			)}
		>
			{children}
		</span>
	);
}
