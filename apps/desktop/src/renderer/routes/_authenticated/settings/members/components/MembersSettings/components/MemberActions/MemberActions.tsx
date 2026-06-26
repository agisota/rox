import {
	getAvailableRoleChanges,
	getRoleLevel,
	type OrganizationRole,
} from "@rox/shared/auth";
import { alert } from "@rox/ui/atoms/Alert";
import { Button } from "@rox/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { formatOrganizationRole } from "@rox/ui/org-management";
import { toast } from "@rox/ui/sonner";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { HiEllipsisVertical, HiOutlineTrash } from "react-icons/hi2";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import type { TeamMember } from "../../../../types";

export function MemberActions({
	member,
	currentUserRole,
	ownerCount,
	isCurrentUser,
	canRemove,
}: {
	member: TeamMember;
	currentUserRole: OrganizationRole;
	ownerCount: number;
	isCurrentUser: boolean;
	canRemove: boolean;
}) {
	const [isChangingRole, setIsChangingRole] = useState(false);
	const { refetch: refetchSession } = authClient.useSession();
	const navigate = useNavigate();

	const availableRoles = getAvailableRoleChanges(
		currentUserRole,
		member.role,
		ownerCount,
	);

	async function leaveOrganization(): Promise<void> {
		const result = await apiTrpcClient.organization.leave.mutate({
			organizationId: member.organizationId,
		});

		// Update session with new active organization (or null if none left)
		await authClient.organization.setActive({
			organizationId: result.activeOrganizationId ?? null,
		});
		await refetchSession();
		navigate({ to: "/" });
	}

	async function removeMember(): Promise<void> {
		await apiTrpcClient.organization.removeMember.mutate({
			organizationId: member.organizationId,
			userId: member.userId,
		});
	}

	function handleRemove(): void {
		if (isCurrentUser) {
			toast.promise(leaveOrganization(), {
				loading: "Выходим из организации...",
				success: "Вы вышли из организации",
				error: (err) => err.message || "Не удалось выйти из организации",
			});
		} else {
			toast.promise(removeMember(), {
				loading: "Удаляем участника...",
				success: "Участник удалён",
				error: (err) => err.message || "Не удалось удалить участника",
			});
		}
	}

	const handleRemoveClick = () => {
		alert({
			title: isCurrentUser ? "Выйти из организации?" : "Удалить участника?",
			description: isCurrentUser
				? "Вы точно хотите выйти из этой организации? Доступ будет потерян сразу."
				: `Вы точно хотите удалить ${member.name} (${member.email}) из организации? Пользователь сразу потеряет доступ.`,
			actions: [
				{ label: "Отмена", variant: "outline", onClick: () => {} },
				{
					label: isCurrentUser ? "Выйти из организации" : "Удалить участника",
					variant: "destructive",
					onClick: () => handleRemove(),
				},
			],
		});
	};

	const handleChangeRole = async (newRole: OrganizationRole) => {
		setIsChangingRole(true);
		try {
			await apiTrpcClient.organization.updateMemberRole.mutate({
				organizationId: member.organizationId,
				memberId: member.memberId,
				role: newRole,
			});
			toast.success(`Роль изменена на «${formatOrganizationRole(newRole)}»`);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Не удалось изменить роль",
			);
		} finally {
			setIsChangingRole(false);
		}
	};

	const handleRoleSelection = (newRole: OrganizationRole) => {
		const isSelfDemotion =
			isCurrentUser && getRoleLevel(newRole) < getRoleLevel(member.role);

		if (isSelfDemotion) {
			alert({
				title: "Понизить свою роль?",
				description: `Вы собираетесь изменить свою роль с «${formatOrganizationRole(member.role)}» на «${formatOrganizationRole(newRole)}». Восстановить ваши права сможет только другой владелец. Продолжить?`,
				actions: [
					{ label: "Отмена", variant: "outline", onClick: () => {} },
					{
						label: "Да, понизить роль",
						variant: "destructive",
						onClick: () => handleChangeRole(newRole),
					},
				],
			});
		} else {
			handleChangeRole(newRole);
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" className="h-8 w-8">
					<HiEllipsisVertical className="h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{availableRoles.length > 0 && (
					<DropdownMenuSub>
						<DropdownMenuSubTrigger disabled={isChangingRole}>
							Изменить роль
						</DropdownMenuSubTrigger>
						<DropdownMenuSubContent>
							{availableRoles.map((role) => (
								<DropdownMenuItem
									key={role}
									onSelect={() => handleRoleSelection(role)}
									disabled={isChangingRole}
								>
									Изменить на «{formatOrganizationRole(role)}»
								</DropdownMenuItem>
							))}
						</DropdownMenuSubContent>
					</DropdownMenuSub>
				)}

				{isCurrentUser ? (
					<DropdownMenuItem
						className="text-destructive gap-2"
						onSelect={handleRemoveClick}
					>
						<HiOutlineTrash className="h-4 w-4 text-destructive" />
						<span>Выйти из организации...</span>
					</DropdownMenuItem>
				) : canRemove ? (
					<DropdownMenuItem
						className="text-destructive gap-2"
						onSelect={handleRemoveClick}
					>
						<HiOutlineTrash className="h-4 w-4 text-destructive" />
						<span>Удалить участника</span>
					</DropdownMenuItem>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
