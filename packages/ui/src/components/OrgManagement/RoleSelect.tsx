import type { OrganizationRole } from "@rox/shared/auth";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { formatOrganizationRole } from "./roles";

export interface RoleSelectProps {
	value: OrganizationRole;
	onValueChange: (role: OrganizationRole) => void;
	/** Roles the actor is allowed to assign. */
	roles: OrganizationRole[];
	disabled?: boolean;
	id?: string;
	className?: string;
}

/**
 * Presentation-only role picker shared by the invite form and member role
 * editing on both web and desktop (Hermes-borrow F27). Permission filtering of
 * `roles` is the host app's responsibility.
 */
export function RoleSelect({
	value,
	onValueChange,
	roles,
	disabled,
	id,
	className,
}: RoleSelectProps) {
	return (
		<Select
			value={value}
			onValueChange={(val) => onValueChange(val as OrganizationRole)}
		>
			<SelectTrigger id={id} disabled={disabled} className={className}>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{roles.map((role) => (
					<SelectItem key={role} value={role}>
						{formatOrganizationRole(role)}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
