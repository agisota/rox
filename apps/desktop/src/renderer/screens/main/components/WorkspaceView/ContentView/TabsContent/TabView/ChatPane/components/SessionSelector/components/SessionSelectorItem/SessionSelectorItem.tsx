import { alert } from "@rox/ui/atoms/Alert";
import { DropdownMenuItem } from "@rox/ui/dropdown-menu";
import { SessionRow, type SessionRowData } from "@rox/ui/session-row";
import { toast } from "@rox/ui/sonner";

interface SessionSelectorItemProps {
	sessionId: string;
	title: string;
	isCurrent: boolean;
	onSelectSession: (sessionId: string) => void;
	onDeleteSession: (sessionId: string) => Promise<void>;
}

/**
 * Thin host wrapper around the shared `@rox/ui` `SessionRow` (Hermes-borrow
 * F20): keeps the dropdown-item semantics and the delete-confirmation dialog +
 * toast here, while the row's presentation lives once in `@rox/ui`. This call
 * site has no pin affordance (legacy chat pane), so `onSetPinned` is omitted.
 */
export function SessionSelectorItem({
	sessionId,
	title,
	isCurrent,
	onSelectSession,
	onDeleteSession,
}: SessionSelectorItemProps) {
	const data: SessionRowData = { sessionId, title, isCurrent };

	const confirmDelete = () => {
		alert({
			title: "Удалить сессию чата",
			description: "Вы уверены, что хотите удалить эту сессию?",
			actions: [
				{ label: "Отмена", variant: "outline", onClick: () => {} },
				{
					label: "Удалить",
					variant: "destructive",
					onClick: () => {
						toast.promise(onDeleteSession(sessionId), {
							loading: "Deleting session...",
							success: "Session deleted",
							error: "Failed to delete session",
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
				onDelete={confirmDelete}
				deleteLabel="Удалить сессию"
				emptyTitleLabel="New Chat"
			/>
		</DropdownMenuItem>
	);
}
