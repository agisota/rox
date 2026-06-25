import { zodResolver } from "@hookform/resolvers/zod";
import { canInvite, type OrganizationRole } from "@rox/shared/auth";
import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@rox/ui/form";
import { Input } from "@rox/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { toast } from "@rox/ui/sonner";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { authClient } from "renderer/lib/auth-client";
import { z } from "zod";

interface InviteMemberDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	organizationName: string;
	invitableRoles: OrganizationRole[];
	currentUserRole: OrganizationRole;
}

const ROLE_LABELS: Record<OrganizationRole, string> = {
	owner: "Владелец",
	admin: "Администратор",
	member: "Участник",
};

function getRoleLabel(role: OrganizationRole): string {
	return ROLE_LABELS[role];
}

const ORGANIZATION_ROLES = ["owner", "admin", "member"] as const;

const inviteMemberFormSchema = z.object({
	email: z
		.string()
		.trim()
		.min(1, "Укажите эл. почту.")
		.email("Введите корректный адрес эл. почты."),
	role: z.enum(ORGANIZATION_ROLES),
});

type InviteMemberFormValues = z.infer<typeof inviteMemberFormSchema>;

export function InviteMemberDialog({
	open,
	onOpenChange,
	organizationId,
	organizationName,
	invitableRoles,
	currentUserRole,
}: InviteMemberDialogProps) {
	const form = useForm<InviteMemberFormValues>({
		resolver: zodResolver(inviteMemberFormSchema),
		defaultValues: {
			email: "",
			role: "member",
		},
	});

	// Reset to a clean state whenever the dialog re-opens.
	useEffect(() => {
		if (open) {
			form.reset({ email: "", role: "member" });
		}
	}, [open, form]);

	const isInviting = form.formState.isSubmitting;

	const handleInvite = async (values: InviteMemberFormValues) => {
		if (!canInvite(currentUserRole, values.role)) {
			form.setError("role", {
				type: "manual",
				message: `Нельзя приглашать пользователей с ролью «${getRoleLabel(values.role)}»`,
			});
			return;
		}

		try {
			await authClient.organization.inviteMember({
				organizationId,
				email: values.email,
				role: values.role,
			});

			toast.success(`Приглашение отправлено на ${values.email}`);
			form.reset({ email: "", role: "member" });
			onOpenChange(false);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Не удалось отправить приглашение",
			);
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

				<Form {...form}>
					<form
						className="space-y-4 py-4"
						onSubmit={form.handleSubmit(handleInvite)}
					>
						<FormField
							control={form.control}
							name="email"
							render={({ field }) => (
								<FormItem className="space-y-2">
									<FormLabel>Эл. почта</FormLabel>
									<FormControl>
										<Input
											{...field}
											type="email"
											placeholder="user@example.com"
											disabled={isInviting}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>

						<FormField
							control={form.control}
							name="role"
							render={({ field }) => (
								<FormItem className="space-y-2">
									<FormLabel>Роль</FormLabel>
									<Select
										value={field.value}
										onValueChange={field.onChange}
										disabled={isInviting}
									>
										<FormControl>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											{invitableRoles.map((r) => (
												<SelectItem key={r} value={r}>
													{getRoleLabel(r)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>

						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => onOpenChange(false)}
								disabled={isInviting}
							>
								Отмена
							</Button>
							<Button type="submit" disabled={isInviting}>
								{isInviting ? "Отправляем..." : "Отправить приглашение"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
