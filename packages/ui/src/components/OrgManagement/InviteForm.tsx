import type { OrganizationRole } from "@rox/shared/auth";
import { useState } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { RoleSelect } from "./RoleSelect";

export interface InviteFormValues {
	email: string;
	role: OrganizationRole;
}

export interface InviteFormProps {
	/** Roles the actor can invite (host filters by permission). */
	invitableRoles: OrganizationRole[];
	defaultRole?: OrganizationRole;
	isSubmitting?: boolean;
	onSubmit: (values: InviteFormValues) => void;
	onCancel?: () => void;
	className?: string;
}

/**
 * Presentation-only invite-member form shared by web and desktop (Hermes-borrow
 * F27). Holds local email/role state and calls back `onSubmit`; the host wires
 * the actual `authClient.organization.inviteMember` call and toasts.
 */
export function InviteForm({
	invitableRoles,
	defaultRole = "member",
	isSubmitting = false,
	onSubmit,
	onCancel,
	className,
}: InviteFormProps) {
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<OrganizationRole>(defaultRole);

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		if (!email || isSubmitting) return;
		onSubmit({ email, role });
	};

	return (
		<form className={className} onSubmit={handleSubmit}>
			<div className="space-y-4 py-4">
				<div className="space-y-2">
					<Label htmlFor="invite-email">Эл. почта</Label>
					<Input
						id="invite-email"
						type="email"
						placeholder="user@example.com"
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						disabled={isSubmitting}
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="invite-role">Роль</Label>
					<RoleSelect
						id="invite-role"
						value={role}
						onValueChange={setRole}
						roles={invitableRoles}
						disabled={isSubmitting}
					/>
				</div>
			</div>

			<div className="flex justify-end gap-2">
				{onCancel ? (
					<Button
						type="button"
						variant="outline"
						onClick={onCancel}
						disabled={isSubmitting}
					>
						Отмена
					</Button>
				) : null}
				<Button type="submit" disabled={isSubmitting || !email}>
					{isSubmitting ? "Отправляем..." : "Отправить приглашение"}
				</Button>
			</div>
		</form>
	);
}
