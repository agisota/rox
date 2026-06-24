import { alert } from "@rox/ui/atoms/Alert";
import { DropdownMenuItem } from "@rox/ui/dropdown-menu";
import { toast } from "@rox/ui/sonner";
import { HiMiniTrash } from "react-icons/hi2";

interface SessionSelectorItemProps {
	sessionId: string;
	title: string;
	isCurrent: boolean;
	onSelectSession: (sessionId: string) => void;
	onDeleteSession: (sessionId: string) => Promise<void>;
}

export function SessionSelectorItem({
	sessionId,
	title,
	isCurrent,
	onSelectSession,
	onDeleteSession,
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
