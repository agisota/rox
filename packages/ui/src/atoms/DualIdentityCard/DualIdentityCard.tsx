import { identityGlyph } from "@rox/shared/identity-glyph";
import { cn } from "../../lib/utils";
import { Avatar } from "../Avatar";

/**
 * The human half of the dual-identity card. Sourced from `user_profiles` /
 * better-auth session on every platform; the card only renders what it's given
 * (presentational, serializable).
 */
export type HumanIdentity = {
	/** Stable seed for the deterministic avatar colour (user id or handle). */
	id: string;
	displayName: string;
	/** Public `@handle` (without the leading `@`); omitted when unclaimed. */
	handle?: string | null;
	avatarUrl?: string | null;
	/** Whether to show the green online dot. */
	online?: boolean;
};

/**
 * The active agent-persona half. Mirrors a `agent_personas` row plus its
 * resolved `theme_json` fields (model / gateway / skills) — all optional so the
 * card degrades gracefully before a persona is configured.
 */
export type PersonaIdentity = {
	/** Stable seed for the deterministic accent (persona id). */
	id: string;
	displayName: string;
	handle?: string | null;
	avatarUrl?: string | null;
	/** Ready-to-use CSS colour string; falls back to the deterministic accent. */
	accentColor?: string | null;
	/** Backing model label (e.g. "claude-opus-4"). */
	model?: string | null;
	/** Gateway label; the dot next to it reflects `gatewayOnline`. */
	gateway?: string | null;
	gatewayOnline?: boolean;
	/** Skill labels rendered as compact chips. */
	skills?: readonly string[];
};

export type DualIdentityCardProps = {
	human: HumanIdentity;
	/** The active persona, or `null`/absent before one is selected. */
	persona?: PersonaIdentity | null;
	className?: string;
};

/** A small status dot; green when active, muted otherwise. */
function StatusDot({
	active,
	className,
}: {
	active?: boolean;
	className?: string;
}) {
	return (
		<span
			aria-hidden
			className={cn(
				"inline-block size-2 shrink-0 rounded-full",
				active ? "bg-emerald-500" : "bg-muted-foreground/40",
				className,
			)}
		/>
	);
}

/**
 * Cross-platform dual-identity card (Hermes-borrow F21): two stacked rows — the
 * HUMAN (avatar/initials via `identity-glyph`, name, `@handle`, online dot) and
 * the active PERSONA (avatar, name, model, gateway dot, skill chips). Purely
 * presentational and prop-driven — the same component renders in the desktop
 * titlebar, the web composer popover, and (via the same props) an RN
 * bottom-sheet. No tRPC, no platform APIs, so it is the single cross-platform
 * core.
 */
export function DualIdentityCard({
	human,
	persona,
	className,
}: DualIdentityCardProps) {
	const personaAccent = persona
		? (persona.accentColor ?? identityGlyph(persona.id).background)
		: null;

	return (
		<div
			className={cn(
				"flex w-full flex-col gap-2 rounded-lg border bg-card p-2 text-sm",
				className,
			)}
			data-testid="dual-identity-card"
		>
			{/* HUMAN row */}
			<div className="flex items-center gap-2" data-testid="identity-human">
				<Avatar
					size="sm"
					seed={human.id}
					fullName={human.displayName}
					image={human.avatarUrl ?? undefined}
				/>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-1.5">
						<span className="truncate font-medium">{human.displayName}</span>
						<StatusDot active={human.online} />
					</div>
					{human.handle ? (
						<div className="truncate text-xs text-muted-foreground">
							@{human.handle}
						</div>
					) : null}
				</div>
			</div>

			{/* PERSONA row */}
			{persona ? (
				<div
					className="flex items-start gap-2 border-t pt-2"
					data-testid="identity-persona"
				>
					<Avatar
						size="sm"
						seed={persona.id}
						fullName={persona.displayName}
						image={persona.avatarUrl ?? undefined}
					/>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5">
							<span
								aria-hidden
								className="inline-block size-2 shrink-0 rounded-full"
								style={
									personaAccent ? { backgroundColor: personaAccent } : undefined
								}
							/>
							<span className="truncate font-medium">
								{persona.displayName}
							</span>
							{persona.handle ? (
								<span className="truncate text-xs text-muted-foreground">
									@{persona.handle}
								</span>
							) : null}
						</div>
						<div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
							{persona.model ? (
								<span className="truncate">{persona.model}</span>
							) : null}
							{persona.gateway ? (
								<span className="flex items-center gap-1">
									<StatusDot active={persona.gatewayOnline} />
									<span className="truncate">{persona.gateway}</span>
								</span>
							) : null}
						</div>
						{persona.skills && persona.skills.length > 0 ? (
							<div className="mt-1 flex flex-wrap gap-1">
								{persona.skills.map((skill) => (
									<span
										key={skill}
										className="rounded bg-muted px-1.5 py-0.5 text-[0.625rem] leading-none text-muted-foreground"
									>
										{skill}
									</span>
								))}
							</div>
						) : null}
					</div>
				</div>
			) : (
				<div
					className="border-t pt-2 text-xs text-muted-foreground"
					data-testid="identity-persona-empty"
				>
					Персона не выбрана
				</div>
			)}
		</div>
	);
}
