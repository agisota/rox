import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { cn } from "@rox/ui/utils";
import { PenSquare } from "lucide-react";
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
	/** Unread badge count for Входящие (best-effort; 0 hides the badge). */
	inboxUnread?: number;
}

/**
 * Left rail (Panel 1): "Написать" CTA, the system folders, a divider, then the
 * smart filters. The active folder gets a glass `bg-accent` fill plus a left
 * accent bar. Only `inbox` is server-backed in P0; non-backed folders are still
 * selectable and show their own empty copy (honest, not hidden).
 *
 * Glass token per spec: `bg-card/60 backdrop-blur border-r border-border/60`.
 */
export function MailFolderRail({
	active,
	onSelect,
	onCompose,
	inboxUnread = 0,
}: MailFolderRailProps) {
	return (
		<nav
			aria-label="Папки почты"
			className="flex h-full flex-col gap-1 border-border/60 border-r bg-card/60 p-2 backdrop-blur-xl"
		>
			<Button onClick={onCompose} className="mb-1 w-full justify-start gap-2">
				<PenSquare className="size-4" /> Написать
			</Button>

			{MAIL_FOLDERS.map((folder, index) => {
				const Icon = MAIL_FOLDER_ICONS[folder.id] ?? MAIL_FALLBACK_ICON;
				const isActive = folder.id === active;
				const showDivider =
					index > 0 && MAIL_FOLDERS[index - 1].kind !== folder.kind;
				const badge =
					folder.id === "inbox" && inboxUnread > 0 ? inboxUnread : null;

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
							{badge !== null && (
								<Badge
									variant="secondary"
									className="h-4 shrink-0 px-1.5 text-[10px] tabular-nums"
								>
									{badge > 99 ? "99+" : badge}
								</Badge>
							)}
						</button>
					</Fragment>
				);
			})}
		</nav>
	);
}
