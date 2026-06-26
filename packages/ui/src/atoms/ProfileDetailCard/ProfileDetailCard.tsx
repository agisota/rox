import { identityGlyph } from "@rox/shared/identity-glyph";
import { cn } from "../../lib/utils";
import { Avatar } from "../Avatar";

/**
 * A single persona's detail fields, mirroring a `agent_personas` row plus its
 * resolved `theme_json` (Hermes-borrow F21). Everything is optional so the card
 * degrades gracefully before a persona is fully configured. Purely serializable
 * — no functions, no platform handles — so the same props drive the desktop
 * dropdown detail-pane, the web composer, and a React-Native bottom-sheet from
 * one active-persona store.
 */
export type ProfileDetail = {
	/** Stable seed for the deterministic accent/avatar (persona id). */
	id: string;
	displayName: string;
	/** Public `@handle` (without the leading `@`); omitted when unclaimed. */
	handle?: string | null;
	avatarUrl?: string | null;
	/** Ready-to-use CSS colour string; falls back to the deterministic accent. */
	accentColor?: string | null;
	/** Backing model label (e.g. "claude-opus-4"). */
	model?: string | null;
	/** Provider label (e.g. "anthropic"). */
	provider?: string | null;
	/** Gateway label; the status dot reflects `gatewayOnline`. */
	gateway?: string | null;
	/** Whether the gateway is up — drives the green glow on the status dot. */
	gatewayOnline?: boolean;
	/** Skill labels rendered as compact chips. */
	skills?: readonly string[];
	/** Default space (org/workspace) label this persona is anchored to. */
	defaultSpace?: string | null;
};

export type ProfileDetailCardProps = {
	persona: ProfileDetail;
	className?: string;
};

/**
 * A status dot. When `online`, it glows green (gateway up); otherwise it shows a
 * muted dot. The glow is a soft box-shadow so it reads as "live" on every
 * platform without relying on animation.
 */
function StatusDot({
	online,
	className,
}: {
	online?: boolean;
	className?: string;
}) {
	return (
		<span
			aria-hidden
			data-online={online ? "true" : "false"}
			className={cn(
				"inline-block size-2 shrink-0 rounded-full",
				online
					? "bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]"
					: "bg-muted-foreground/40",
				className,
			)}
		/>
	);
}

/** One label/value row; the value falls back to an em dash when absent. */
function DetailRow({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-baseline justify-between gap-3">
			<span className="shrink-0 text-xs text-muted-foreground">{label}</span>
			<span className="min-w-0 flex-1 truncate text-right text-xs font-medium">
				{children}
			</span>
		</div>
	);
}

/**
 * Cross-platform persona detail card (Hermes-borrow F23): the favourite ②
 * detail-pane for the persona switcher dropdown. Renders a persona header
 * (avatar, name, `@handle`) plus a fielded body — Status / Gateway / Model /
 * Provider / Skills / Default space — with a status dot that glows green when
 * the gateway is up.
 *
 * Lifted from the web identity-settings cards into a presentational,
 * prop-driven `@rox/ui` atom: no tRPC, no platform APIs, so the same component
 * is the single cross-platform core. The desktop/web dropdown feeds it the
 * active persona from `personas.getActive` (theme resolved to model / provider /
 * gateway / skills); a React-Native bottom-sheet renders the same props from the
 * same active-persona store. Display only — F47 owns the live gateway/skills
 * mutations.
 */
export function ProfileDetailCard({
	persona,
	className,
}: ProfileDetailCardProps) {
	const accent = persona.accentColor ?? identityGlyph(persona.id).background;
	const hasSkills = persona.skills != null && persona.skills.length > 0;

	return (
		<div
			className={cn(
				"flex w-full flex-col gap-3 rounded-lg border bg-card p-3 text-sm",
				className,
			)}
			data-testid="profile-detail-card"
		>
			{/* Persona header */}
			<div className="flex items-center gap-2">
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
							style={{ backgroundColor: accent }}
						/>
						<span className="truncate font-medium">{persona.displayName}</span>
					</div>
					{persona.handle ? (
						<div className="truncate text-xs text-muted-foreground">
							@{persona.handle}
						</div>
					) : null}
				</div>
			</div>

			{/* Fielded body */}
			<div className="flex flex-col gap-1.5 border-t pt-2">
				<div className="flex items-baseline justify-between gap-3">
					<span className="shrink-0 text-xs text-muted-foreground">Статус</span>
					<span className="flex min-w-0 items-center gap-1.5">
						<StatusDot online={persona.gatewayOnline} />
						<span className="truncate text-xs font-medium">
							{persona.gatewayOnline ? "В сети" : "Не в сети"}
						</span>
					</span>
				</div>
				<DetailRow label="Gateway">{persona.gateway ?? "—"}</DetailRow>
				<DetailRow label="Модель">{persona.model ?? "—"}</DetailRow>
				<DetailRow label="Провайдер">{persona.provider ?? "—"}</DetailRow>
				<DetailRow label="Спейс по умолчанию">
					{persona.defaultSpace ?? "—"}
				</DetailRow>
			</div>

			{/* Skills */}
			<div
				className="flex flex-col gap-1 border-t pt-2"
				data-testid="profile-detail-skills"
			>
				<span className="text-xs text-muted-foreground">Навыки</span>
				{hasSkills ? (
					<div className="flex flex-wrap gap-1">
						{persona.skills?.map((skill) => (
							<span
								key={skill}
								className="rounded bg-muted px-1.5 py-0.5 text-[0.625rem] leading-none text-muted-foreground"
							>
								{skill}
							</span>
						))}
					</div>
				) : (
					<span className="text-xs text-muted-foreground">—</span>
				)}
			</div>
		</div>
	);
}
