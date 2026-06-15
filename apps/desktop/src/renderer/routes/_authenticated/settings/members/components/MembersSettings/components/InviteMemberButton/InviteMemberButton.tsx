import { getInvitableRoles, type OrganizationRole } from "@rox/shared/auth";
import { Button } from "@rox/ui/button";
import { useState } from "react";
import { HiOutlinePlus } from "react-icons/hi2";
import { InviteMemberDialog } from "./components/InviteMemberDialog";

interface InviteMemberButtonProps {
	currentUserRole: OrganizationRole;
	organizationId: string;
	organizationName: string;
}

export function InviteMemberButton({
	currentUserRole,
	organizationId,
	organizationName,
}: InviteMemberButtonProps) {
	const [open, setOpen] = useState(false);

	const invitableRoles = getInvitableRoles(currentUserRole);

	// Hide button if user can't invite anyone
	if (invitableRoles.length === 0) {
		return null;
	}

	// The Rox edition is free for everyone, so inviting a member has no billing
	// impact — open the invite dialog directly without a paywall/cost warning.
	return (
		<>
			<Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
				<HiOutlinePlus className="h-3.5 w-3.5" />
				Пригласить участника
			</Button>

			<InviteMemberDialog
				open={open}
				onOpenChange={setOpen}
				organizationId={organizationId}
				organizationName={organizationName}
				invitableRoles={invitableRoles}
				currentUserRole={currentUserRole}
			/>
		</>
	);
}
