import { Button } from "@rox/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { AnimatedHeight, MotionList, MotionListItem } from "@rox/ui/motion";
import { Skeleton } from "@rox/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@rox/ui/tooltip";
import {
	Archive,
	ArrowLeft,
	Forward,
	Mail,
	MailOpen,
	MoreVertical,
	Reply,
	ReplyAll,
	Trash2,
} from "lucide-react";
import type { MailThread, MailThreadMessage } from "../lib/mailTypes";
import { MailComposer, type MailComposerProps } from "./MailComposer";
import { MailMessageCard } from "./MailMessageCard";

export interface MailThreadReaderProps {
	thread: MailThread | null;
	messages: MailThreadMessage[];
	expandedIds: Set<string>;
	onToggleMessage: (id: string) => void;
	isLoading: boolean;
	error: string | null;
	onRetry: () => void;
	/** Reader toolbar actions. */
	onReply: () => void;
	onReplyAll: () => void;
	onForward: () => void;
	onArchive: () => void;
	onTrash: () => void;
	onMarkUnread: () => void;
	onBack: () => void;
	/** Inline composer state; when null the composer is closed. */
	composer: MailComposerProps | null;
}

/** One toolbar icon button with a tooltip label. */
function ToolbarButton({
	label,
	icon: Icon,
	onClick,
	disabled,
}: {
	label: string;
	icon: typeof Reply;
	onClick: () => void;
	disabled?: boolean;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					size="icon"
					variant="ghost"
					className="size-8"
					onClick={onClick}
					disabled={disabled}
					aria-label={label}
				>
					<Icon className="size-4" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

/**
 * Panel 3 — the thread reader. Shows the empty/loading/error states, then a
 * toolbar (reply / reply-all / forward / archive / trash / kebab) over a stack
 * of {@link MailMessageCard}s (latest expanded, others collapsed). The inline
 * {@link MailComposer} reveals at the bottom via `AnimatedHeight` when a
 * reply/forward/compose is in progress — never a modal.
 */
export function MailThreadReader({
	thread,
	messages,
	expandedIds,
	onToggleMessage,
	isLoading,
	error,
	onRetry,
	onReply,
	onReplyAll,
	onForward,
	onArchive,
	onTrash,
	onMarkUnread,
	onBack,
	composer,
}: MailThreadReaderProps) {
	if (!thread && !isLoading && !error && !composer) {
		return (
			<div className="flex h-full flex-col items-center justify-center bg-card/40 text-center">
				<Mail className="mb-3 size-8 text-muted-foreground" />
				<span className="text-muted-foreground text-sm">
					Выберите переписку
				</span>
			</div>
		);
	}

	const title = thread?.subjectNorm?.trim() || "(без темы)";

	return (
		<TooltipProvider delayDuration={300}>
			<div className="flex h-full min-h-0 flex-col bg-card/40">
				{/* Header / toolbar */}
				<header className="flex shrink-0 items-center gap-2 border-border/50 border-b px-3 py-2">
					<Button
						size="icon"
						variant="ghost"
						className="size-8 lg:hidden"
						onClick={onBack}
						aria-label="Назад к списку"
					>
						<ArrowLeft className="size-4" />
					</Button>
					<h2 className="min-w-0 flex-1 truncate font-semibold text-base">
						{title}
					</h2>
					{thread && (
						<div className="flex shrink-0 items-center gap-0.5">
							<ToolbarButton label="Ответить" icon={Reply} onClick={onReply} />
							<ToolbarButton
								label="Ответить всем"
								icon={ReplyAll}
								onClick={onReplyAll}
							/>
							<ToolbarButton
								label="Переслать"
								icon={Forward}
								onClick={onForward}
							/>
							<ToolbarButton
								label="Архивировать"
								icon={Archive}
								onClick={onArchive}
							/>
							<ToolbarButton label="Удалить" icon={Trash2} onClick={onTrash} />
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button
										size="icon"
										variant="ghost"
										className="size-8"
										aria-label="Ещё"
									>
										<MoreVertical className="size-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem onClick={onMarkUnread}>
										<MailOpen className="size-4" /> Отметить непрочитанным
									</DropdownMenuItem>
									<DropdownMenuItem onClick={onArchive}>
										<Archive className="size-4" /> Архивировать
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={onTrash}
										className="text-destructive focus:text-destructive"
									>
										<Trash2 className="size-4" /> Удалить
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					)}
				</header>

				{/* Body */}
				<div className="min-h-0 flex-1 overflow-y-auto p-3">
					{error ? (
						<div className="flex flex-col items-center gap-2 py-12 text-center">
							<p className="cursor-text select-text text-destructive text-sm">
								{error}
							</p>
							<Button size="sm" variant="outline" onClick={onRetry}>
								Повторить
							</Button>
						</div>
					) : isLoading && messages.length === 0 ? (
						<div className="space-y-3">
							<Skeleton className="h-6 w-1/2" />
							<Skeleton className="h-24 w-full" />
							<Skeleton className="h-16 w-full" />
						</div>
					) : (
						<MotionList className="space-y-2">
							{messages.map((message) => (
								<MotionListItem key={message.id}>
									<MailMessageCard
										message={message}
										expanded={expandedIds.has(message.id)}
										onToggle={onToggleMessage}
									/>
								</MotionListItem>
							))}
						</MotionList>
					)}
				</div>

				{/* Inline composer (reveals on reply/forward) */}
				<AnimatedHeight open={composer !== null}>
					{composer && (
						<div className="shrink-0 border-border/50 border-t p-3">
							<MailComposer {...composer} />
						</div>
					)}
				</AnimatedHeight>
			</div>
		</TooltipProvider>
	);
}
