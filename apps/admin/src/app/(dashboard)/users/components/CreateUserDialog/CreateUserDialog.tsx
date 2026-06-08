"use client";

import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
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
import { useState } from "react";
import { LuLoaderCircle, LuPlus } from "react-icons/lu";

import { useTRPC } from "@/trpc/react";

type Role = "user" | "admin";

export function CreateUserDialog() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [role, setRole] = useState<Role>("user");
	const [password, setPassword] = useState("");

	const createMutation = useMutation(
		trpc.admin.createUser.mutationOptions({
			onSuccess: (result) => {
				queryClient.invalidateQueries({
					queryKey: trpc.admin.listUsers.queryKey(),
				});
				queryClient.invalidateQueries({
					queryKey: trpc.admin.getStats.queryKey(),
				});
				if (result.temporaryPassword) {
					toast.success("User created", {
						description: `Temporary password: ${result.temporaryPassword}`,
						duration: 30000,
					});
				} else {
					toast.success("User created");
				}
				setEmail("");
				setName("");
				setRole("user");
				setPassword("");
				setOpen(false);
			},
			onError: (error) => {
				toast.error(`Failed to create user: ${error.message}`);
			},
		}),
	);

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		createMutation.mutate({
			email: email.trim(),
			name: name.trim(),
			role,
			password: password.length > 0 ? password : undefined,
		});
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm">
					<LuPlus className="mr-2 h-4 w-4" />
					Create user
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Create user</DialogTitle>
						<DialogDescription>
							Provision a new account. Leave the password blank to generate a
							temporary one.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="create-user-email">Email</Label>
							<Input
								id="create-user-email"
								type="email"
								required
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="person@example.com"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="create-user-name">Name</Label>
							<Input
								id="create-user-name"
								required
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Jane Doe"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="create-user-role">Role</Label>
							<Select
								value={role}
								onValueChange={(value) => setRole(value as Role)}
							>
								<SelectTrigger id="create-user-role">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="user">User</SelectItem>
									<SelectItem value="admin">Admin</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="create-user-password">Password (optional)</Label>
							<Input
								id="create-user-password"
								type="text"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="Auto-generate if blank"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button type="submit" disabled={createMutation.isPending}>
							{createMutation.isPending ? (
								<LuLoaderCircle className="mr-2 h-4 w-4 animate-spin" />
							) : null}
							Create user
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
