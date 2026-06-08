import {
	canInvite,
	ORGANIZATION_ROLES,
	type OrganizationRole,
} from "@rox/shared/auth";
import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { toast } from "@rox/ui/sonner";
import { useLiveQuery } from "@tanstack/react-db";
import { useState } from "react";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

// Sentinel for the team Select meaning "let the server pick the default team".
// `beforeCreateInvitation` defaults a null teamId to the org's oldest team, so
// leaving this selected keeps invites additive.
const AUTO_TEAM = "auto";

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
	const collections = useCollections();
	const [email, setEmail] = useState("");
	const [role, setRole] = useState<OrganizationRole>("member");
	const [teamId, setTeamId] = useState<string>(AUTO_TEAM);
	const [isInviting, setIsInviting] = useState(false);

	const { data: teamsData } = useLiveQuery(
		(q) =>
			q
				.from({ teams: collections.teams })
				.select(({ teams }) => ({ ...teams }))
				.orderBy(({ teams }) => teams.createdAt, "asc"),
		[collections],
	);
	const teams = teamsData ?? [];

	const handleInvite = async () => {
		if (!canInvite(currentUserRole, role)) {
			toast.error(`Cannot invite users as ${ORGANIZATION_ROLES[role].name}`);
			return;
		}

		setIsInviting(true);
		try {
			await authClient.organization.inviteMember({
				organizationId,
				email,
				role,
				...(teamId !== AUTO_TEAM ? { teamId } : {}),
			});

			toast.success(`Invitation sent to ${email}`);
			setEmail("");
			setRole("member");
			setTeamId(AUTO_TEAM);
			onOpenChange(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Failed to send invitation",
			);
		} finally {
			setIsInviting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Invite Member</DialogTitle>
					<DialogDescription>
						Send an invitation to join {organizationName}. Expires in 48 hours.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					<div className="space-y-2">
						<Label htmlFor="email">Email</Label>
						<Input
							id="email"
							type="email"
							placeholder="user@example.com"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && email && !isInviting) {
									handleInvite();
								}
							}}
							disabled={isInviting}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="role">Role</Label>
						<Select
							value={role}
							onValueChange={(val) => setRole(val as OrganizationRole)}
						>
							<SelectTrigger id="role" disabled={isInviting}>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{invitableRoles.map((r) => (
									<SelectItem key={r} value={r}>
										{ORGANIZATION_ROLES[r].name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{teams.length > 0 && (
						<div className="space-y-2">
							<Label htmlFor="team">Team</Label>
							<Select value={teamId} onValueChange={setTeamId}>
								<SelectTrigger id="team" disabled={isInviting}>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={AUTO_TEAM}>Default team</SelectItem>
									{teams.map((team) => (
										<SelectItem key={team.id} value={team.id}>
											{team.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">
								The member is added to this team on accept. Defaults to your
								organization's first team.
							</p>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isInviting}
					>
						Cancel
					</Button>
					<Button onClick={handleInvite} disabled={isInviting || !email}>
						{isInviting ? "Sending..." : "Send Invitation"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
