"use client";

import { Check, ChevronDown } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { cn } from "../../lib/utils";
import { Avatar } from "../Avatar";

/**
 * A single selectable persona, mirroring an `agent_personas` row (Hermes-borrow
 * F21) reduced to what the chip needs to render. Purely presentational and
 * serializable so the same option list drives the desktop dropdown, the web
 * composer chip, and the React-Native bottom-sheet from one active-persona
 * store.
 */
export type IdentitySwitcherPersona = {
	/** Stable seed for the deterministic glyph/accent (persona id). */
	id: string;
	displayName: string;
	/** Public `@handle` (without the leading `@`); omitted when unset. */
	handle?: string | null;
	avatarUrl?: string | null;
	/** Ready-to-use CSS colour; falls back to the deterministic glyph accent. */
	accentColor?: string | null;
};

export type IdentitySwitcherProps = {
	/** The caller's personas, already org-scoped + name-sorted by the source. */
	personas: readonly IdentitySwitcherPersona[];
	/** The active persona's id, or `null`/absent before one is selected. */
	activeId?: string | null;
	/** Point the active-persona pointer at `personaId` (F21 `setActive`). */
	onSelect: (personaId: string) => void;
	/** Disable the chip while a list/switch round-trip is in flight. */
	loading?: boolean;
	/** Label shown before any persona exists/loads. */
	placeholder?: string;
	/**
	 * Detail-pane rendered below the persona list (Hermes-borrow F23) — typically
	 * a `ProfileDetailCard` for the active persona. Optional so the bare chip is
	 * unchanged for callers that don't supply one.
	 */
	detail?: React.ReactNode;
	className?: string;
};

/**
 * Persona switcher chip (Hermes-borrow F22) — a fork of the org-switcher
 * `AgentsHeader`, retargeted at the active-persona pointer. Renders a compact
 * pill (glyph + persona name + chevron) that opens a dropdown of the caller's
 * personas; selecting one calls `onSelect`, which the host wires to
 * `personas.setActive`. The active persona is marked with a check.
 *
 * Purely presentational and prop-driven — no tRPC, no platform APIs — so it is
 * the single cross-platform core: the web composer feeds it live `personas.list`
 * data, while a React-Native bottom-sheet renders the same options from the same
 * active-persona store. The single source of personas is the F21 tRPC surface.
 */
export function IdentitySwitcher({
	personas,
	activeId,
	onSelect,
	loading,
	placeholder = "Персона",
	detail,
	className,
}: IdentitySwitcherProps) {
	const active = activeId
		? (personas.find((persona) => persona.id === activeId) ?? null)
		: null;
	const label = active?.displayName ?? placeholder;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					disabled={loading || personas.length === 0}
					aria-label={`Сменить персону: ${label}`}
					data-testid="identity-switcher-trigger"
					className={cn(
						"flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-border/60 bg-secondary/50 px-2 text-xs font-medium transition-colors duration-150 hover:border-border hover:bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60",
						className,
					)}
				>
					{active ? (
						<Avatar
							size="xs"
							className="size-4"
							seed={active.id}
							fullName={active.displayName}
							image={active.avatarUrl ?? undefined}
						/>
					) : (
						<span
							aria-hidden
							className="inline-block size-2 shrink-0 rounded-full bg-muted-foreground/40"
						/>
					)}
					<span className="max-w-28 truncate">{label}</span>
					<ChevronDown className="size-3 text-muted-foreground" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="min-w-48">
				<DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
					Персона
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{personas.map((persona) => (
					<DropdownMenuItem
						key={persona.id}
						className="cursor-pointer gap-2"
						data-testid="identity-switcher-item"
						onSelect={(event) => {
							event.preventDefault();
							onSelect(persona.id);
						}}
					>
						<Avatar
							size="xs"
							className="size-5"
							seed={persona.id}
							fullName={persona.displayName}
							image={persona.avatarUrl ?? undefined}
						/>
						<span className="min-w-0 flex-1 truncate text-left">
							{persona.displayName}
							{persona.handle ? (
								<span className="ml-1 text-xs text-muted-foreground">
									@{persona.handle}
								</span>
							) : null}
						</span>
						{persona.id === activeId ? (
							<Check className="size-4 text-primary" />
						) : null}
					</DropdownMenuItem>
				))}
				{detail ? (
					<>
						<DropdownMenuSeparator />
						<div className="p-1" data-testid="identity-switcher-detail">
							{detail}
						</div>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
