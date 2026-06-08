import type { SelectAccessGrant } from "@rox/db/schema";
import type { OrganizationRole } from "@rox/shared/auth";
import { type AccessRole, canManageGrant } from "@rox/shared/auth";
import { Avatar } from "@rox/ui/atoms/Avatar";
import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { Label } from "@rox/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { toast } from "@rox/ui/sonner";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useMemo, useState } from "react";
import { HiOutlineTrash } from "react-icons/hi2";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

type ResourceType = SelectAccessGrant["resourceType"];
type GranteeType = SelectAccessGrant["granteeType"];

interface ShareDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	organizationName: string;
	resourceType: ResourceType;
	resourceId: string;
	resourceName: string;
	/** Org-level role of the current user; gates whether they can manage grants. */
	currentUserOrgRole: OrganizationRole;
}

const ROLE_OPTIONS: { value: AccessRole; label: string }[] = [
	{ value: "viewer", label: "Viewer" },
	{ value: "editor", label: "Editor" },
	{ value: "admin", label: "Admin" },
];

const GRANTEE_LABELS: Record<GranteeType, string> = {
	organization: "Everyone in the organization",
	team: "Team",
	user: "Individual",
};

export function ShareDialog({
	open,
	onOpenChange,
	organizationId,
	organizationName,
	resourceType,
	resourceId,
	resourceName,
	currentUserOrgRole,
}: ShareDialogProps) {
	const collections = useCollections();
	const canManage = canManageGrant(currentUserOrgRole);

	const [granteeType, setGranteeType] = useState<GranteeType>("team");
	const [granteeId, setGranteeId] = useState<string>("");
	const [role, setRole] = useState<AccessRole>("viewer");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);

	const { data: teamsData } = useLiveQuery(
		(q) =>
			q
				.from({ teams: collections.teams })
				.select(({ teams }) => ({ ...teams }))
				.orderBy(({ teams }) => teams.createdAt, "asc"),
		[collections],
	);
	const teams = teamsData ?? [];

	const { data: usersData } = useLiveQuery(
		(q) =>
			q
				.from({ members: collections.members })
				.innerJoin({ users: collections.users }, ({ members, users }) =>
					eq(members.userId, users.id),
				)
				.select(({ users }) => ({ ...users })),
		[collections],
	);
	const orgUsers = usersData ?? [];

	const { data: grantsData } = useLiveQuery(
		(q) =>
			q
				.from({ ag: collections.accessGrants })
				.select(({ ag }) => ({ ...ag }))
				.orderBy(({ ag }) => ag.createdAt, "desc"),
		[collections],
	);

	const grants = useMemo(
		() =>
			(grantsData ?? []).filter(
				(g) => g.resourceType === resourceType && g.resourceId === resourceId,
			),
		[grantsData, resourceType, resourceId],
	);

	const teamsById = useMemo(
		() => new Map(teams.map((t) => [t.id, t])),
		[teams],
	);
	const usersById = useMemo(
		() => new Map(orgUsers.map((u) => [u.id, u])),
		[orgUsers],
	);

	function describeGrantee(grant: SelectAccessGrant): string {
		switch (grant.granteeType) {
			case "organization":
				return organizationName;
			case "team":
				return teamsById.get(grant.granteeId)?.name ?? "Unknown team";
			default: {
				const user = usersById.get(grant.granteeId);
				return user?.name || user?.email || "Unknown member";
			}
		}
	}

	// The grantee id is implicit for an org-wide grant; explicit otherwise.
	const resolvedGranteeId =
		granteeType === "organization" ? organizationId : granteeId;
	const canSubmit = canManage && !isSubmitting && resolvedGranteeId.length > 0;

	function resetSelection() {
		setGranteeId("");
		setRole("viewer");
	}

	async function handleShare() {
		if (!canSubmit) return;
		setIsSubmitting(true);
		try {
			await apiTrpcClient.share.grant.mutate({
				resourceType,
				resourceId,
				granteeType,
				granteeId: resolvedGranteeId,
				role,
			});
			toast.success("Access granted");
			resetSelection();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to grant access",
			);
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleRevoke(grantId: string) {
		setPendingRevokeId(grantId);
		try {
			await apiTrpcClient.share.revoke.mutate({ id: grantId });
			toast.success("Access revoked");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to revoke access",
			);
		} finally {
			setPendingRevokeId(null);
		}
	}

	function handleGranteeTypeChange(value: string) {
		setGranteeType(value as GranteeType);
		setGranteeId("");
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Share {resourceName}</DialogTitle>
					<DialogDescription>
						Grant a team, an individual, or your whole organization access to
						this {resourceType}.
					</DialogDescription>
				</DialogHeader>

				{canManage ? (
					<div className="space-y-4 py-2">
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-2">
								<Label htmlFor="grantee-type">Share with</Label>
								<Select
									value={granteeType}
									onValueChange={handleGranteeTypeChange}
								>
									<SelectTrigger id="grantee-type" disabled={isSubmitting}>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{(Object.keys(GRANTEE_LABELS) as GranteeType[]).map(
											(type) => (
												<SelectItem key={type} value={type}>
													{GRANTEE_LABELS[type]}
												</SelectItem>
											),
										)}
									</SelectContent>
								</Select>
							</div>

							<div className="space-y-2">
								<Label htmlFor="grantee-role">Role</Label>
								<Select
									value={role}
									onValueChange={(value) => setRole(value as AccessRole)}
								>
									<SelectTrigger id="grantee-role" disabled={isSubmitting}>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{ROLE_OPTIONS.map((option) => (
											<SelectItem key={option.value} value={option.value}>
												{option.label}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						</div>

						{granteeType === "team" && (
							<div className="space-y-2">
								<Label htmlFor="grantee-team">Team</Label>
								<Select value={granteeId} onValueChange={setGranteeId}>
									<SelectTrigger id="grantee-team" disabled={isSubmitting}>
										<SelectValue placeholder="Select a team" />
									</SelectTrigger>
									<SelectContent>
										{teams.map((team) => (
											<SelectItem key={team.id} value={team.id}>
												{team.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}

						{granteeType === "user" && (
							<div className="space-y-2">
								<Label htmlFor="grantee-user">Member</Label>
								<Select value={granteeId} onValueChange={setGranteeId}>
									<SelectTrigger id="grantee-user" disabled={isSubmitting}>
										<SelectValue placeholder="Select a member" />
									</SelectTrigger>
									<SelectContent>
										{orgUsers.map((user) => (
											<SelectItem key={user.id} value={user.id}>
												{user.name || user.email}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}

						<div className="flex justify-end">
							<Button onClick={handleShare} disabled={!canSubmit}>
								{isSubmitting ? "Sharing..." : "Share"}
							</Button>
						</div>
					</div>
				) : (
					<p className="py-2 text-sm text-muted-foreground">
						Only organization admins and owners can change sharing.
					</p>
				)}

				<div className="space-y-2 border-t pt-4">
					<p className="text-sm font-medium">People with access</p>
					{grants.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							Not shared with anyone yet.
						</p>
					) : (
						<ul className="space-y-1">
							{grants.map((grant) => {
								const name = describeGrantee(grant);
								return (
									<li
										key={grant.id}
										className="flex items-center gap-2.5 rounded-md px-1 py-1.5"
									>
										{grant.granteeType === "user" && (
											<Avatar
												size="sm"
												fullName={name}
												image={usersById.get(grant.granteeId)?.image ?? null}
											/>
										)}
										<span className="flex-1 truncate text-sm font-medium">
											{name}
										</span>
										<span className="text-xs capitalize text-muted-foreground">
											{grant.role}
										</span>
										{canManage && (
											<Button
												variant="ghost"
												size="icon"
												className="h-7 w-7"
												disabled={pendingRevokeId === grant.id}
												onClick={() => handleRevoke(grant.id)}
												aria-label={`Revoke access for ${name}`}
											>
												<HiOutlineTrash className="h-4 w-4" />
											</Button>
										)}
									</li>
								);
							})}
						</ul>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
