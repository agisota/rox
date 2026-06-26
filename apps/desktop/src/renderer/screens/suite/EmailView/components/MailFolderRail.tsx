import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { cn } from "@rox/ui/utils";
import { PenSquare, Tag } from "lucide-react";
import { Fragment } from "react";
import {
	MAIL_FALLBACK_ICON,
	MAIL_FOLDER_ICONS,
	MAIL_FOLDERS,
} from "../lib/mailFolders";
import type { MailFolderId } from "../lib/mailTypes";

export interface MailFolderRailProps {
	active: MailFolderId;
	onSelect: (id: MailFolderId) => void;
	onCompose: () => void;
	/** Visible item count per folder/filter (0 hides the badge, except 0 unread). */
	counts: Record<MailFolderId, number>;
}

/**
 * Left rail (Panel 1): a "Написать" CTA, the system folders with live counts, a
 * divider, the smart filters, then a labels section (room reserved for
 * server-defined labels — recon notes "room for labels"). The active folder gets
 * a glass `bg-accent` fill plus a left accent bar.
 *
 * Counts come from {@link deriveMailCounts} over the loaded page + the local
 * organization store, so archive/trash/spam/flagged/drafts show real numbers.
 * `sent`/`attachments` stay at 0 until the server exposes the needed columns
 * (TODO(server) — see mailCounts).
 *
 * Glass token per spec: `bg-card/60 backdrop-blur border-r border-border/60`.
 */
export function MailFolderRail({
	active,
	onSelect,
	onCompose,
	counts,
}: MailFolderRailProps) {
	return (
		<nav
			aria-label="Папки почты"
			className="flex h-full flex-col gap-1 overflow-y-auto border-border/60 border-r bg-card/60 p-2 backdrop-blur-xl"
		>
			<Button onClick={onCompose} className="mb-1 w-full justify-start gap-2">
				<PenSquare className="size-4" /> Написать
			</Button>

			{MAIL_FOLDERS.map((folder, index) => {
				const Icon = MAIL_FOLDER_ICONS[folder.id] ?? MAIL_FALLBACK_ICON;
				const isActive = folder.id === active;
				const showDivider =
					index > 0 && MAIL_FOLDERS[index - 1].kind !== folder.kind;
				const count = counts[folder.id] ?? 0;
				// Входящие/Непрочитанные surface the unread emphasis; other folders show
				// a neutral total. Trash/spam/archive only badge when non-empty.
				const emphasize = folder.id === "inbox" || folder.id === "unread";
				const showBadge = count > 0;

				return (
					<Fragment key={folder.id}>
						{showDivider && <div className="my-1 h-px bg-border/50" />}
						<button
							type="button"
							onClick={() => onSelect(folder.id)}
							aria-current={isActive ? "true" : undefined}
							className={cn(
								"group relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
								isActive
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
							)}
						>
							{isActive && (
								<span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-primary" />
							)}
							<Icon className="size-4 shrink-0" />
							<span className="flex-1 truncate">{folder.label}</span>
							{showBadge && (
								<Badge
									variant={emphasize ? "default" : "secondary"}
									className="h-4 shrink-0 px-1.5 text-[10px] tabular-nums"
								>
									{count > 99 ? "99+" : count}
								</Badge>
							)}
						</button>
					</Fragment>
				);
			})}

			{/* Labels — room reserved for server-defined labels (recon: "room for
			    labels"). TODO(server): map mail labels to a `mail.labels` query and
			    render each as a selectable rail entry with its color + count. */}
			<div className="my-1 h-px bg-border/50" />
			<div className="flex items-center gap-2 px-2.5 py-1 text-[10px] text-muted-foreground/70 uppercase tracking-wide">
				<Tag className="size-3" /> Ярлыки
			</div>
			<p className="px-2.5 pb-1 text-[11px] text-muted-foreground/60 leading-snug">
				Появятся, когда вы создадите ярлыки.
			</p>
		</nav>
	);
}
