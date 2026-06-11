import { Button } from "@rox/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { TableCell, TableRow } from "@rox/ui/table";
import { HiOutlineTrash } from "react-icons/hi2";

export interface MemberRowData {
	usersHostsId: string;
	userId: string;
	role: "owner" | "member";
	name: string;
	email: string;
}

interface MemberRowProps {
	member: MemberRowData;
	isOwner: boolean;
	onSetRole: (member: MemberRowData, role: "owner" | "member") => void;
	onRemove: (member: MemberRowData) => void;
}

const ROLE_LABELS: Record<MemberRowData["role"], string> = {
	owner: "Владелец",
	member: "Участник",
};

export function MemberRow({
	member,
	isOwner,
	onSetRole,
	onRemove,
}: MemberRowProps) {
	return (
		<TableRow>
			<TableCell className="font-medium">{member.name}</TableCell>
			<TableCell className="text-muted-foreground">{member.email}</TableCell>
			<TableCell>
				{isOwner ? (
					<Select
						value={member.role}
						onValueChange={(value) =>
							onSetRole(member, value as "owner" | "member")
						}
					>
						<SelectTrigger className="h-8">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="owner">Владелец</SelectItem>
							<SelectItem value="member">Участник</SelectItem>
						</SelectContent>
					</Select>
				) : (
					<span className="text-sm">{ROLE_LABELS[member.role]}</span>
				)}
			</TableCell>
			{isOwner && (
				<TableCell>
					<Button
						variant="ghost"
						size="sm"
						onClick={() => onRemove(member)}
						aria-label={`Удалить ${member.name}`}
					>
						<HiOutlineTrash className="h-4 w-4" />
					</Button>
				</TableCell>
			)}
		</TableRow>
	);
}
