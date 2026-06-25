import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@rox/ui/tooltip";
import { cn } from "@rox/ui/utils";
import { AtSign, Mail, PenSquare, Search } from "lucide-react";
import { mailParticipantInitial } from "../lib/mailFormat";

export interface MailHeaderProps {
	/** Better-auth account email (`session.user.email`). */
	accountEmail: string | null;
	/** Display name of the signed-in account, if any. */
	accountName: string | null;
	/** The provisioned routable mailbox address (`<handle>@rox.one`), if ready. */
	mailboxAddress: string | null;
	/** Total threads in the mailbox. */
	total: number;
	/** Best-effort unread thread count (Входящие). */
	unread: number;
	/** Global search box value (shared with the list). */
	search: string;
	onSearchChange: (value: string) => void;
	searchRef?: React.RefObject<HTMLInputElement | null>;
	/** Open the composer for a brand-new message (Cmd+N). */
	onCompose: () => void;
}

/**
 * Always-visible mail header (Panel 0), spanning the full window width above the
 * three panes. Shows the signed-in identity (the `<handle>@rox.one` mailbox plus
 * the better-auth account email), live total / unread badges, a global search
 * box, and the primary "Написать" action.
 *
 * Identity sourcing (recon integrationPoints): the account email comes from
 * `authClient.useSession()` upstream; the mailbox address from
 * `mail.provisionAddress`. Both are passed in so this stays a pure presentational
 * component. Glass token: `bg-card/60 backdrop-blur border-b border-border/60`.
 */
export function MailHeader({
	accountEmail,
	accountName,
	mailboxAddress,
	total,
	unread,
	search,
	onSearchChange,
	searchRef,
	onCompose,
}: MailHeaderProps) {
	const primaryLabel = mailboxAddress ?? accountEmail ?? "Почта";
	const secondaryLabel =
		mailboxAddress && accountEmail && mailboxAddress !== accountEmail
			? accountEmail
			: (accountName ?? null);

	return (
		<TooltipProvider delayDuration={300}>
			<header className="flex shrink-0 items-center gap-3 border-border/60 border-b bg-card/60 px-4 py-2.5 backdrop-blur-xl">
				{/* Identity */}
				<div className="flex min-w-0 items-center gap-2.5">
					<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 font-semibold text-primary text-sm">
						{mailboxAddress ? (
							mailParticipantInitial(mailboxAddress)
						) : (
							<Mail className="size-4" />
						)}
					</span>
					<div className="flex min-w-0 flex-col leading-tight">
						<span className="flex items-center gap-1 truncate font-medium text-sm">
							<AtSign className="size-3 shrink-0 text-muted-foreground" />
							<span className="truncate font-mono">{primaryLabel}</span>
						</span>
						{secondaryLabel && (
							<span className="truncate text-[11px] text-muted-foreground">
								{secondaryLabel}
							</span>
						)}
					</div>
				</div>

				{/* Counts */}
				<div className="flex shrink-0 items-center gap-1.5">
					<Tooltip>
						<TooltipTrigger asChild>
							<Badge
								variant="secondary"
								className="h-5 cursor-default gap-1 px-2 text-[11px] tabular-nums"
							>
								Всего {total > 999 ? "999+" : total}
							</Badge>
						</TooltipTrigger>
						<TooltipContent>Всего переписок в почте</TooltipContent>
					</Tooltip>
					<Tooltip>
						<TooltipTrigger asChild>
							<Badge
								className={cn(
									"h-5 cursor-default gap-1 px-2 text-[11px] tabular-nums",
									unread === 0 && "opacity-60",
								)}
							>
								Новых {unread > 999 ? "999+" : unread}
							</Badge>
						</TooltipTrigger>
						<TooltipContent>Непрочитанные (приблизительно)</TooltipContent>
					</Tooltip>
				</div>

				{/* Search */}
				<div className="relative ml-auto w-full max-w-md">
					<Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-3.5 text-muted-foreground" />
					<Input
						ref={searchRef}
						value={search}
						onChange={(e) => onSearchChange(e.target.value)}
						placeholder="Поиск по почте…"
						className="h-8 pl-8 text-xs"
						aria-label="Поиск по почте"
					/>
				</div>

				{/* Compose */}
				<Tooltip>
					<TooltipTrigger asChild>
						<Button onClick={onCompose} size="sm" className="shrink-0 gap-2">
							<PenSquare className="size-4" /> Написать
						</Button>
					</TooltipTrigger>
					<TooltipContent>Новое письмо · ⌘N</TooltipContent>
				</Tooltip>
			</header>
		</TooltipProvider>
	);
}
