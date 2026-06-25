import type { OrganizationRole } from "@rox/shared/auth";

/**
 * Russian display labels for organization roles. Mirrors the copy that the
 * desktop members/organization settings used inline so web and desktop render
 * the exact same wording from a single source.
 */
export const ORGANIZATION_ROLE_LABELS: Record<OrganizationRole, string> = {
	owner: "Владелец",
	admin: "Администратор",
	member: "Участник",
};

export function formatOrganizationRole(role: OrganizationRole): string {
	return ORGANIZATION_ROLE_LABELS[role] ?? role;
}
