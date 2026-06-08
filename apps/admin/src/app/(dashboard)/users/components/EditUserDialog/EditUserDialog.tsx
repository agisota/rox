"use client";

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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LuLoaderCircle } from "react-icons/lu";

import { useTRPC } from "@/trpc/react";

export type EditableUser = {
	id: string;
	name: string;
	role: string;
	status: "active" | "banned" | "suspended";
};

interface EditUserDialogProps {
	user: EditableUser | null;
	onOpenChange: (open: boolean) => void;
}

type Role = "user" | "admin";
type Status = "active" | "banned" | "suspended";

export function EditUserDialog({ user, onOpenChange }: EditUserDialogProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [name, setName] = useState("");
	const [role, setRole] = useState<Role>("user");
	const [status, setStatus] = useState<Status>("active");

	useEffect(() => {
		if (user) {
			setName(user.name);
			setRole(user.role === "admin" ? "admin" : "user");
			setStatus(user.status);
		}
	}, [user]);

	const updateMutation = useMutation(
		trpc.admin.updateUser.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.admin.listUsers.queryKey(),
				});
				toast.success("User updated");
				onOpenChange(false);
			},
			onError: (error) => {
				toast.error(`Failed to update user: ${error.message}`);
			},
		}),
	);

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		if (!user) return;
		updateMutation.mutate({ userId: user.id, name: name.trim(), role, status });
	};

	return (
		<Dialog open={!!user} onOpenChange={onOpenChange}>
			<DialogContent>
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Edit user</DialogTitle>
						<DialogDescription>
							Update the user's name, role and account status.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="edit-user-name">Name</Label>
							<Input
								id="edit-user-name"
								required
								value={name}
								onChange={(e) => setName(e.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="edit-user-role">Role</Label>
							<Select
								value={role}
								onValueChange={(value) => setRole(value as Role)}
							>
								<SelectTrigger id="edit-user-role">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="user">User</SelectItem>
									<SelectItem value="admin">Admin</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="edit-user-status">Status</Label>
							<Select
								value={status}
								onValueChange={(value) => setStatus(value as Status)}
							>
								<SelectTrigger id="edit-user-status">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="active">Active</SelectItem>
									<SelectItem value="suspended">Suspended</SelectItem>
									<SelectItem value="banned">Banned</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
					<DialogFooter>
						<Button type="submit" disabled={updateMutation.isPending}>
							{updateMutation.isPending ? (
								<LuLoaderCircle className="mr-2 h-4 w-4 animate-spin" />
							) : null}
							Save changes
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
