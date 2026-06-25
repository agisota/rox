import type { OrganizationRole } from "@rox/shared/auth";
import type { ReactNode } from "react";
import { Avatar } from "../../atoms/Avatar";
import { Badge } from "../ui/badge";
import { TableCell, TableRow } from "../ui/table";
import { formatOrganizationRole } from "./roles";

export interface MemberRowMember {
	/** Stable member id (organization membership row id). */
	memberId: string;
	userId: string;
	name?: string | null;
	email?: string | null;
	image?: string | null;
	role: OrganizationRole;
	createdAt: Date | string;
}

export interface MemberRowProps {
	member: MemberRowMember;
	/** Marks this row as the viewer ("Вы" badge). */
	isCurrentUser?: boolean;
	/** Localized "added on" date string. Caller formats to keep locale control. */
	addedLabel?: string;
	/** Per-row actions slot (dropdown menu, role select, remove button…). */
	actions?: ReactNode;
}

/**
 * Presentation-only organization member row. Lifted from the desktop
 * OrganizationSettings members table (Hermes-borrow F27) so web and desktop
 * render identical member rows. Data fetching, mutations and permission gating
 * stay in the host app; this component only renders props.
 */
export function MemberRow({
	member,
	isCurrentUser = false,
	addedLabel,
	actions,
}: MemberRowProps) {
	return (
		<TableRow>
			<TableCell>
				<div className="flex items-center gap-3">
					<Avatar
						size="md"
						fullName={member.name}
						image={member.image}
						seed={member.userId}
					/>
					<div className="flex items-center gap-2">
						<span className="font-medium">{member.name || "Неизвестно"}</span>
						{isCurrentUser && (
							<Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
								Вы
							</Badge>
						)}
					</div>
				</div>
			</TableCell>
			<TableCell className="text-muted-foreground">{member.email}</TableCell>
			<TableCell>
				<Badge
					variant={member.role === "owner" ? "default" : "outline"}
					className="text-xs"
				>
					{formatOrganizationRole(member.role)}
				</Badge>
			</TableCell>
			<TableCell className="text-muted-foreground">{addedLabel}</TableCell>
			<TableCell>{actions}</TableCell>
		</TableRow>
	);
}
