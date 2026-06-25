import { alert } from "@rox/ui/atoms/Alert";
import { DropdownMenuItem } from "@rox/ui/dropdown-menu";
import { toast } from "@rox/ui/sonner";
import { HiMiniStar, HiMiniTrash, HiOutlineStar } from "react-icons/hi2";

interface SessionSelectorItemProps {
	sessionId: string;
	title: string;
	isCurrent: boolean;
	pinned: boolean;
	onSelectSession: (sessionId: string) => void;
	onDeleteSession: (sessionId: string) => Promise<void>;
	onSetPinned: (sessionId: string, pinned: boolean) => Promise<void>;
}

export function SessionSelectorItem({
	sessionId,
	title,
	isCurrent,
	pinned,
	onSelectSession,
	onDeleteSession,
	onSetPinned,
}: SessionSelectorItemProps) {
	return (
		<DropdownMenuItem
			className="group flex items-center gap-2"
			onSelect={() => {
				onSelectSession(sessionId);
			}}
		>
			<span
				className={`min-w-0 flex-1 truncate text-xs ${isCurrent ? "font-semibold" : ""}`}
			>
				{title || "Новый чат"}
			</span>
			<button
				type="button"
				title={pinned ? "Открепить" : "Закрепить"}
				aria-label={pinned ? "Открепить сессию" : "Закрепить сессию"}
				className={`shrink-0 rounded p-0.5 transition-opacity hover:bg-muted ${
					pinned
						? "text-amber-500 opacity-100"
						: "opacity-0 group-hover:opacity-100"
				}`}
				onClick={(event) => {
					event.stopPropagation();
					toast.promise(onSetPinned(sessionId, !pinned), {
						loading: pinned ? "Открепление…" : "Закрепление…",
						success: pinned ? "Сессия откреплена" : "Сессия закреплена",
						error: pinned
							? "Не удалось открепить сессию"
							: "Не удалось закрепить сессию",
					});
				}}
			>
				{pinned ? (
					<HiMiniStar className="size-3" />
				) : (
					<HiOutlineStar className="size-3" />
				)}
			</button>
			{!isCurrent && (
				<button
					type="button"
					className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
					onClick={(event) => {
						event.stopPropagation();
						alert({
							title: "Удалить сессию чата",
							description: "Удалить эту сессию? Действие необратимо.",
							actions: [
								{ label: "Отмена", variant: "outline", onClick: () => {} },
								{
									label: "Удалить",
									variant: "destructive",
									onClick: () => {
										toast.promise(onDeleteSession(sessionId), {
											loading: "Удаление сессии…",
											success: "Сессия удалена",
											error: "Не удалось удалить сессию",
										});
									},
								},
							],
						});
					}}
				>
					<HiMiniTrash className="size-3" />
				</button>
			)}
		</DropdownMenuItem>
	);
}
