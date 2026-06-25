import { cn } from "../../lib/utils";
import { Avatar } from "../Avatar";

/**
 * The active human, sourced from the better-auth session / `user_profiles`
 * (Hermes-borrow F21). Presentational and serializable — the same props drive
 * the desktop titlebar, the web shell header, and the React-Native compact form.
 */
export type IdentityStatusHuman = {
	/** Stable seed for the deterministic avatar colour (user id or handle). */
	id: string;
	displayName: string;
	/** Public `@handle` (without the leading `@`); shown in place of the name. */
	handle?: string | null;
	avatarUrl?: string | null;
	/** Whether to show the green online dot on the avatar. */
	online?: boolean;
};

/**
 * The active workspace/org context (Hermes-borrow F25) — the "ГДЕ" segment,
 * rendered as `#name`.
 */
export type IdentityStatusWorkspace = {
	id: string;
	name: string;
};

/**
 * The active agent-persona (Hermes-borrow F22) — the "КАК" segment, rendered as
 * `as Name`.
 */
export type IdentityStatusPersona = {
	id: string;
	displayName: string;
};

export type IdentityStatusLineProps = {
	human: IdentityStatusHuman;
	/** Active workspace/org, or `null`/absent before one is resolved. */
	workspace?: IdentityStatusWorkspace | null;
	/** Active persona, or `null`/absent before one is selected. */
	persona?: IdentityStatusPersona | null;
	/**
	 * Live presence count for the active context (Hermes-borrow F37, `@rox/collab`
	 * presence). Mockable until F37 lands. Hidden when `null`/absent or `< 1`.
	 */
	onlineCount?: number | null;
	/**
	 * Word shown after the count (default "online"). Localise per shell.
	 */
	onlineLabel?: string;
	/** Word before the persona name (default "as"). Localise per shell. */
	personaPrefix?: string;
	/**
	 * Force the always-compact form (avatar + glyph + `·N`). Defaults to `false`
	 * on desktop/web where container queries reveal the full line, and is set by
	 * the React-Native shell which has no container-query support.
	 */
	compact?: boolean;
	className?: string;
};

const SEPARATOR = "·";

/** A muted middot separator; hidden in the compact form via the container. */
function Separator({ className }: { className?: string }) {
	return (
		<span
			aria-hidden
			className={cn("shrink-0 text-muted-foreground/60", className)}
		>
			{SEPARATOR}
		</span>
	);
}

/**
 * Identity context status line (Hermes-borrow F36) — the one-line КТО·ГДЕ·КАК
 * summary for a shell header: `@you · #workspace · as Persona · 3 online`.
 *
 * Purely presentational and prop-driven (no tRPC, no platform APIs), so the same
 * component is the single cross-platform core: the desktop titlebar and the web
 * shell header render the full line, which collapses by *priority* as the
 * container narrows — workspace drops first, then the persona, then the human
 * name — always keeping the avatar/glyph and the `·N` count. The React-Native
 * shell passes `compact` to render that minimal form directly.
 *
 * Truncation is container-driven (not viewport-driven) so the line adapts to the
 * width of the header slot it is mounted in, wherever that slot sits.
 */
export function IdentityStatusLine({
	human,
	workspace,
	persona,
	onlineCount,
	onlineLabel = "online",
	personaPrefix = "as",
	compact = false,
	className,
}: IdentityStatusLineProps) {
	const name = human.handle ? `@${human.handle}` : human.displayName;
	const showCount = typeof onlineCount === "number" && onlineCount >= 1;

	// The full context as one string — kept readable even when segments collapse
	// under priority truncation (or in the compact form), via `title` + sr-only.
	const summary = `${name}${workspace ? ` · #${workspace.name}` : ""}${
		persona ? ` · ${personaPrefix} ${persona.displayName}` : ""
	}${showCount ? ` · ${onlineCount} ${onlineLabel}` : ""}`;

	return (
		<div
			data-testid="identity-status-line"
			data-compact={compact ? "" : undefined}
			title={summary}
			className={cn(
				"flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground",
				// Container so the priority truncation reacts to the header slot's
				// width rather than the viewport. The compact form skips it entirely.
				compact ? undefined : "@container/identity-status-line",
				className,
			)}
		>
			{/* The complete context for assistive tech, regardless of truncation. */}
			<span className="sr-only">{summary}</span>

			{/* КТО — always shown (avatar + glyph carry the identity in compact form) */}
			<span
				className="flex min-w-0 items-center gap-1.5"
				data-testid="identity-status-human"
			>
				<Avatar
					size="xs"
					className="size-4 shrink-0"
					seed={human.id}
					fullName={human.displayName}
					image={human.avatarUrl ?? undefined}
				/>
				{human.online ? (
					<span
						aria-hidden
						data-testid="identity-status-online-dot"
						className="-ml-2.5 mt-2.5 size-1.5 shrink-0 rounded-full bg-emerald-500 ring-1 ring-background"
					/>
				) : null}
				{compact ? null : (
					<span className="hidden truncate font-medium text-foreground @[10rem]/identity-status-line:inline">
						{name}
					</span>
				)}
			</span>

			{/* ГДЕ — workspace, the first to drop on narrow widths */}
			{workspace && !compact ? (
				<span
					className="hidden min-w-0 items-center gap-1.5 @[22rem]/identity-status-line:flex"
					data-testid="identity-status-workspace"
				>
					<Separator />
					<span className="truncate">#{workspace.name}</span>
				</span>
			) : null}

			{/* КАК — active persona, drops before the human name */}
			{persona && !compact ? (
				<span
					className="hidden min-w-0 items-center gap-1.5 @[16rem]/identity-status-line:flex"
					data-testid="identity-status-persona"
				>
					<Separator />
					<span className="truncate">
						{personaPrefix} {persona.displayName}
					</span>
				</span>
			) : null}

			{/* presence count — always shown when present (compact keeps just ·N) */}
			{showCount ? (
				<span
					className="flex shrink-0 items-center gap-1.5"
					data-testid="identity-status-online-count"
				>
					<Separator />
					<span className="tabular-nums">
						{onlineCount}
						{compact ? null : (
							<span className="hidden @[12rem]/identity-status-line:inline">
								{" "}
								{onlineLabel}
							</span>
						)}
					</span>
				</span>
			) : null}
		</div>
	);
}
