import type {
	SelectInvitation,
	SelectMember,
	SelectUser,
} from "@rox/db/schema/auth";
import type { OrganizationRole } from "@rox/shared/auth";

export type TeamMember = SelectUser &
	SelectMember & {
		memberId: string;
		role: OrganizationRole;
	};

export type InvitationRow = SelectInvitation & {
	inviterName: string;
};
