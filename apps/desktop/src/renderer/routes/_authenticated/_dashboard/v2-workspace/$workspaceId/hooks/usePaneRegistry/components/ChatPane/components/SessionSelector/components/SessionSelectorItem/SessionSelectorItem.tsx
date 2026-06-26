import { alert } from "@rox/ui/atoms/Alert";
import { DropdownMenuItem } from "@rox/ui/dropdown-menu";
import { SessionRow, type SessionRowData } from "@rox/ui/session-row";
import { toast } from "@rox/ui/sonner";

interface SessionSelectorItemProps {
	sessionId: string;
	title: string;
	isCurrent: boolean;
	pinned: boolean;
	onSelectSession: (sessionId: string) => void;
	onDeleteSession: (sessionId: string) => Promise<void>;
	onSetPinned: (sessionId: string, pinned: boolean) => Promise<void>;
}

/**
 * Thin host wrapper around the shared `@rox/ui` `SessionRow` (Hermes-borrow
 * F20): keeps the dropdown-item semantics plus the pin (F19) toast and the
 * delete-confirmation dialog + toast here, while the row's presentation lives
 * once in `@rox/ui`. The v2 workspace pane surfaces pin, so `onSetPinned` is
 * wired through.
 */
export function SessionSelectorItem({
	sessionId,
	title,
	isCurrent,
	pinned,
	onSelectSession,
	onDeleteSession,
	onSetPinned,
}: SessionSelectorItemProps) {
	const data: SessionRowData = { sessionId, title, isCurrent, pinned };

	const handleSetPinned = (id: string, nextPinned: boolean) => {
		toast.promise(onSetPinned(id, nextPinned), {
			loading: nextPinned ? "Закрепление…" : "Открепление…",
			success: nextPinned ? "Сессия закреплена" : "Сессия откреплена",
			error: nextPinned
				? "Не удалось закрепить сессию"
				: "Не удалось открепить сессию",
		});
	};

	const confirmDelete = () => {
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
	};

	return (
		<DropdownMenuItem
			className="group flex items-center gap-2"
			onSelect={() => {
				onSelectSession(sessionId);
			}}
		>
			<SessionRow
				data={data}
				onSelect={onSelectSession}
				onSetPinned={handleSetPinned}
				onDelete={confirmDelete}
				pinLabel="Закрепить"
				unpinLabel="Открепить"
				deleteLabel="Удалить сессию"
				emptyTitleLabel="Новый чат"
			/>
		</DropdownMenuItem>
	);
}
