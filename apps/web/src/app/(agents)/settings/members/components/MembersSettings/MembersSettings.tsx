"use client";

import { authClient } from "@rox/auth/client";
import {
	canRemoveMember,
	getAvailableRoleChanges,
	getInvitableRoles,
	getRoleSortPriority,
	type OrganizationRole,
} from "@rox/shared/auth";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import {
	formatOrganizationRole,
	InviteForm,
	type InviteFormValues,
	MemberRow,
} from "@rox/ui/org-management";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import {
	Table,
	TableBody,
	TableHead,
	TableHeader,
	TableRow,
} from "@rox/ui/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreVertical } from "lucide-react";
import { useMemo, useState } from "react";
import { useTRPC } from "@/trpc/react";

function formatDate(date: Date | string): string {
	const d = date instanceof Date ? date : new Date(date);
	return d.toLocaleDateString("ru-RU", { month: "short", day: "numeric" });
}

/**
 * Web parity for the desktop organization members panel (Hermes-borrow F27).
 * Reads members + pending invitations over tRPC (web has no Electric), mutates
 * roles/removals via `trpc.organization.*`, and sends invites via better-auth
 * `authClient.organization.inviteMember`. Presentational rows come from the
 * lifted `@rox/ui/org-management` components shared with desktop.
 */
export function MembersSettings() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data: session } = authClient.useSession();
	const { data: activeOrg } = authClient.useActiveOrganization();

	const currentUserId = session?.user?.id;
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const organizationName = activeOrg?.name ?? "организацию";

	const membersQuery = useQuery(
		trpc.organization.members.list.queryOptions({}),
	);
	const invitationsQuery = useQuery(
		trpc.organization.invitations.list.queryOptions(),
	);

	const [inviteOpen, setInviteOpen] = useState(false);

	const invalidate = () => {
		queryClient.invalidateQueries({
			queryKey: trpc.organization.members.list.queryKey({}),
		});
		queryClient.invalidateQueries({
			queryKey: trpc.organization.invitations.list.queryKey(),
		});
	};

	const updateRoleMutation = useMutation(
		trpc.organization.updateMemberRole.mutationOptions({
			onSuccess: (_data, variables) => {
				invalidate();
				toast.success(
					`Роль изменена на «${formatOrganizationRole(variables.role)}»`,
				);
			},
			onError: (error) =>
				toast.error(error.message || "Не удалось изменить роль"),
		}),
	);

	const removeMemberMutation = useMutation(
		trpc.organization.removeMember.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast.success("Участник удалён");
			},
			onError: (error) =>
				toast.error(error.message || "Не удалось удалить участника"),
		}),
	);

	const members = useMemo(() => {
		const rows = membersQuery.data ?? [];
		return [...rows].sort((a, b) => {
			const priorityDiff =
				getRoleSortPriority(a.role as OrganizationRole) -
				getRoleSortPriority(b.role as OrganizationRole);
			if (priorityDiff !== 0) return priorityDiff;
			return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
		});
	}, [membersQuery.data]);

	const ownerCount = members.filter((m) => m.role === "owner").length;
	const currentMember = members.find((m) => m.userId === currentUserId);
	const currentUserRole = currentMember?.role as OrganizationRole | undefined;
	const invitableRoles = currentUserRole
		? getInvitableRoles(currentUserRole)
		: [];
	const canInviteAny = invitableRoles.length > 0;

	const handleInvite = async ({ email, role }: InviteFormValues) => {
		if (!activeOrganizationId) return;
		try {
			await authClient.organization.inviteMember({
				organizationId: activeOrganizationId,
				email,
				role,
			});
			toast.success(`Приглашение отправлено на ${email}`);
			setInviteOpen(false);
			invalidate();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Не удалось отправить приглашение",
			);
		}
	};

	const invitations = invitationsQuery.data ?? [];

	return (
		<div className="space-y-10">
			<section>
				<div className="mb-4 flex items-end justify-between gap-4">
					<div>
						<h2 className="font-medium text-lg">Участники</h2>
						<p className="mt-1 text-muted-foreground text-sm">
							Все, у кого есть доступ к этой организации.
						</p>
					</div>
					{canInviteAny && (
						<Button onClick={() => setInviteOpen(true)}>Пригласить</Button>
					)}
				</div>

				{membersQuery.isLoading ? (
					<div className="space-y-2 rounded-lg border p-4">
						{[0, 1, 2].map((i) => (
							<Skeleton key={i} className="h-10 w-full" />
						))}
					</div>
				) : members.length === 0 ? (
					<div className="rounded-lg border py-12 text-center text-muted-foreground text-sm">
						Участников пока нет.
					</div>
				) : (
					<div className="overflow-hidden rounded-lg border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Имя</TableHead>
									<TableHead>Эл. почта</TableHead>
									<TableHead>Роль</TableHead>
									<TableHead>Добавлен</TableHead>
									<TableHead className="w-[50px]" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{members.map((member) => {
									const isCurrentUser = member.userId === currentUserId;
									const role = member.role as OrganizationRole;
									const roleChanges = currentUserRole
										? getAvailableRoleChanges(currentUserRole, role, ownerCount)
										: [];
									const canRemove = currentUserRole
										? canRemoveMember(
												currentUserRole,
												role,
												isCurrentUser,
												ownerCount,
											)
										: false;
									const hasActions = roleChanges.length > 0 || canRemove;

									return (
										<MemberRow
											key={member.memberId}
											member={{
												memberId: member.memberId,
												userId: member.userId,
												name: member.name,
												email: member.email,
												image: member.image,
												role,
												createdAt: member.createdAt,
											}}
											isCurrentUser={isCurrentUser}
											addedLabel={formatDate(member.createdAt)}
											actions={
												hasActions && activeOrganizationId ? (
													<DropdownMenu>
														<DropdownMenuTrigger asChild>
															<Button
																variant="ghost"
																size="icon"
																className="size-8"
																aria-label="Действия с участником"
															>
																<MoreVertical className="size-4" />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end">
															{roleChanges.map((newRole) => (
																<DropdownMenuItem
																	key={newRole}
																	disabled={updateRoleMutation.isPending}
																	onClick={() =>
																		updateRoleMutation.mutate({
																			organizationId: activeOrganizationId,
																			memberId: member.memberId,
																			role: newRole,
																		})
																	}
																>
																	Сделать: {formatOrganizationRole(newRole)}
																</DropdownMenuItem>
															))}
															{roleChanges.length > 0 && canRemove && (
																<DropdownMenuSeparator />
															)}
															{canRemove && (
																<DropdownMenuItem
																	variant="destructive"
																	disabled={removeMemberMutation.isPending}
																	onClick={() =>
																		removeMemberMutation.mutate({
																			organizationId: activeOrganizationId,
																			userId: member.userId,
																		})
																	}
																>
																	Удалить участника
																</DropdownMenuItem>
															)}
														</DropdownMenuContent>
													</DropdownMenu>
												) : null
											}
										/>
									);
								})}
							</TableBody>
						</Table>
					</div>
				)}
			</section>

			{invitations.length > 0 && (
				<section>
					<div className="mb-3">
						<h3 className="font-medium text-sm">Ожидающие приглашения</h3>
						<p className="mt-0.5 text-muted-foreground text-xs">
							Приглашения, ещё не принятые участниками.
						</p>
					</div>
					<ul className="divide-y rounded-lg border">
						{invitations.map((invitation) => (
							<li
								key={invitation.id}
								className="flex items-center justify-between gap-4 p-4"
							>
								<div className="min-w-0">
									<p className="truncate font-medium">{invitation.email}</p>
									<p className="truncate text-muted-foreground text-xs">
										Пригласил: {invitation.inviterName || "Неизвестно"}
									</p>
								</div>
								<div className="flex items-center gap-3">
									{invitation.role ? (
										<Badge variant="outline" className="text-xs">
											{formatOrganizationRole(
												invitation.role as OrganizationRole,
											)}
										</Badge>
									) : null}
									<Button
										variant="ghost"
										size="sm"
										onClick={async () => {
											try {
												await authClient.organization.cancelInvitation({
													invitationId: invitation.id,
												});
												toast.success("Приглашение отменено");
												invalidate();
											} catch (error) {
												toast.error(
													error instanceof Error
														? error.message
														: "Не удалось отменить приглашение",
												);
											}
										}}
									>
										Отменить
									</Button>
								</div>
							</li>
						))}
					</ul>
				</section>
			)}

			<Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Пригласить участника</DialogTitle>
						<DialogDescription>
							Отправьте приглашение в {organizationName}. Оно действует 48
							часов.
						</DialogDescription>
					</DialogHeader>
					<InviteForm
						invitableRoles={invitableRoles}
						onSubmit={handleInvite}
						onCancel={() => setInviteOpen(false)}
					/>
				</DialogContent>
			</Dialog>
		</div>
	);
}
