import { canInvite, type OrganizationRole } from "@rox/shared/auth";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { formatOrganizationRole, InviteForm } from "@rox/ui/org-management";
import { toast } from "@rox/ui/sonner";
import { useState } from "react";
import { authClient } from "renderer/lib/auth-client";

interface InviteMemberDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	organizationName: string;
	invitableRoles: OrganizationRole[];
	currentUserRole: OrganizationRole;
}

export function InviteMemberDialog({
	open,
	onOpenChange,
	organizationId,
	organizationName,
	invitableRoles,
	currentUserRole,
}: InviteMemberDialogProps) {
	const [isInviting, setIsInviting] = useState(false);

	const handleInvite = async (email: string, role: OrganizationRole) => {
		if (!canInvite(currentUserRole, role)) {
			toast.error(
				`Нельзя приглашать пользователей с ролью «${formatOrganizationRole(role)}»`,
			);
			return;
		}

		setIsInviting(true);
		try {
			await authClient.organization.inviteMember({
				organizationId,
				email,
				role,
			});

			toast.success(`Приглашение отправлено на ${email}`);
			onOpenChange(false);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Не удалось отправить приглашение",
			);
		} finally {
			setIsInviting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Пригласить участника</DialogTitle>
					<DialogDescription>
						Отправьте приглашение в {organizationName}. Оно действует 48 часов.
					</DialogDescription>
				</DialogHeader>

				<InviteForm
					invitableRoles={invitableRoles}
					isSubmitting={isInviting}
					onSubmit={({ email, role }) => handleInvite(email, role)}
					onCancel={() => onOpenChange(false)}
				/>
			</DialogContent>
		</Dialog>
	);
}
