"use client";

import { getInitials } from "@rox/shared/names";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@rox/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@rox/ui/avatar";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@rox/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@rox/ui/dropdown-menu";
import { toast } from "@rox/ui/sonner";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@rox/ui/table";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import {
	LuBan,
	LuCircleCheck,
	LuEllipsis,
	LuLoaderCircle,
	LuPencil,
	LuTrash2,
	LuUser,
	LuUserCog,
} from "react-icons/lu";

import { useTRPC } from "@/trpc/react";

import { CreateUserDialog } from "../CreateUserDialog";
import { type EditableUser, EditUserDialog } from "../EditUserDialog";

type AdminUser = {
	id: string;
	name: string;
	email: string;
	image: string | null;
	role: string;
	banned: boolean;
	banExpiresAt: Date | null;
};

function deriveStatus(user: AdminUser): EditableUser["status"] {
	if (!user.banned) return "active";
	return user.banExpiresAt ? "suspended" : "banned";
}

export function UsersTable() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data, isLoading, error } = useQuery(
		trpc.admin.listUsers.queryOptions(),
	);

	const [userToDelete, setUserToDelete] = useState<{
		id: string;
		email: string;
		name: string;
	} | null>(null);
	const [userToEdit, setUserToEdit] = useState<EditableUser | null>(null);

	const invalidateUsers = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.admin.listUsers.queryKey(),
		});

	const deleteMutation = useMutation(
		trpc.admin.deleteUser.mutationOptions({
			onSuccess: () => {
				invalidateUsers();
				queryClient.invalidateQueries({
					queryKey: trpc.admin.getStats.queryKey(),
				});
				toast.success(`${userToDelete?.name} has been deleted`);
				setUserToDelete(null);
			},
			onError: (error) => {
				toast.error(`Failed to delete user: ${error.message}`);
			},
		}),
	);

	const banMutation = useMutation(
		trpc.admin.banUser.mutationOptions({
			onSuccess: () => {
				invalidateUsers();
				toast.success("User banned");
			},
			onError: (error) => toast.error(`Failed to ban user: ${error.message}`),
		}),
	);

	const reactivateMutation = useMutation(
		trpc.admin.reactivateUser.mutationOptions({
			onSuccess: () => {
				invalidateUsers();
				toast.success("User reactivated");
			},
			onError: (error) =>
				toast.error(`Failed to reactivate user: ${error.message}`),
		}),
	);

	const impersonateMutation = useMutation(
		trpc.admin.impersonateUser.mutationOptions({
			onSuccess: (result) => {
				toast.success("Impersonation session started", {
					description: `Bearer token (valid 1h): ${result.token}`,
					duration: 30000,
				});
			},
			onError: (error) =>
				toast.error(`Failed to impersonate: ${error.message}`),
		}),
	);

	const handleDelete = () => {
		if (!userToDelete) return;
		deleteMutation.mutate({ userId: userToDelete.id });
	};

	if (isLoading) {
		return (
			<Card>
				<CardContent className="flex items-center justify-center py-12">
					<LuLoaderCircle className="text-muted-foreground h-8 w-8 animate-spin" />
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Card>
				<CardContent className="flex flex-col items-center justify-center py-12 text-center">
					<p className="text-lg font-medium">Failed to load users</p>
					<p className="text-muted-foreground text-sm">
						{error.message || "An error occurred while fetching users"}
					</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<>
			<Card>
				<CardHeader className="flex flex-row items-center justify-between">
					<div>
						<CardTitle>Users</CardTitle>
						<CardDescription>
							{data?.length ?? 0} user{(data?.length ?? 0) !== 1 ? "s" : ""}
						</CardDescription>
					</div>
					<CreateUserDialog />
				</CardHeader>
				<CardContent>
					{!data || data.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 text-center">
							<LuUser className="text-muted-foreground mb-4 h-12 w-12" />
							<p className="text-lg font-medium">No users yet</p>
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>User</TableHead>
									<TableHead>Email</TableHead>
									<TableHead>Role</TableHead>
									<TableHead>Status</TableHead>
									<TableHead>Joined</TableHead>
									<TableHead className="w-[50px]" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{data.map((user) => {
									const status = deriveStatus(user);
									return (
										<TableRow key={user.id}>
											<TableCell>
												<div className="flex items-center gap-3">
													<Avatar className="h-8 w-8">
														<AvatarImage src={user.image ?? undefined} />
														<AvatarFallback>
															{getInitials(user.name, user.email)}
														</AvatarFallback>
													</Avatar>
													<span className="font-medium">{user.name}</span>
												</div>
											</TableCell>
											<TableCell>{user.email}</TableCell>
											<TableCell>
												<Badge
													variant={
														user.role === "admin" ? "default" : "secondary"
													}
												>
													{user.role}
												</Badge>
											</TableCell>
											<TableCell>
												<Badge
													variant={
														status === "active" ? "outline" : "destructive"
													}
												>
													{status}
												</Badge>
											</TableCell>
											<TableCell>
												<div className="text-sm">
													{formatDistanceToNow(new Date(user.createdAt), {
														addSuffix: true,
													})}
												</div>
											</TableCell>
											<TableCell>
												<DropdownMenu>
													<DropdownMenuTrigger asChild>
														<Button variant="ghost" className="h-8 w-8 p-0">
															<span className="sr-only">Open menu</span>
															<LuEllipsis className="h-4 w-4" />
														</Button>
													</DropdownMenuTrigger>
													<DropdownMenuContent align="end">
														<DropdownMenuItem
															onClick={() =>
																setUserToEdit({
																	id: user.id,
																	name: user.name,
																	role: user.role,
																	status,
																})
															}
														>
															<LuPencil className="mr-2 h-4 w-4" />
															Edit
														</DropdownMenuItem>
														{user.banned ? (
															<DropdownMenuItem
																onClick={() =>
																	reactivateMutation.mutate({ userId: user.id })
																}
															>
																<LuCircleCheck className="mr-2 h-4 w-4" />
																Reactivate
															</DropdownMenuItem>
														) : (
															<DropdownMenuItem
																onClick={() =>
																	banMutation.mutate({ userId: user.id })
																}
															>
																<LuBan className="mr-2 h-4 w-4" />
																Ban / suspend
															</DropdownMenuItem>
														)}
														<DropdownMenuItem
															onClick={() =>
																impersonateMutation.mutate({ userId: user.id })
															}
														>
															<LuUserCog className="mr-2 h-4 w-4" />
															Impersonate
														</DropdownMenuItem>
														<DropdownMenuSeparator />
														<DropdownMenuItem
															className="text-destructive focus:text-destructive"
															onClick={() =>
																setUserToDelete({
																	id: user.id,
																	email: user.email,
																	name: user.name,
																})
															}
														>
															<LuTrash2 className="mr-2 h-4 w-4" />
															Delete Permanently
														</DropdownMenuItem>
													</DropdownMenuContent>
												</DropdownMenu>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			<EditUserDialog
				user={userToEdit}
				onOpenChange={(open) => !open && setUserToEdit(null)}
			/>

			<AlertDialog
				open={!!userToDelete}
				onOpenChange={(open) => !open && setUserToDelete(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Permanently delete user?</AlertDialogTitle>
						<AlertDialogDescription asChild>
							<div className="space-y-2">
								<p>
									This will permanently delete{" "}
									<strong>{userToDelete?.name}</strong> ({userToDelete?.email})
									and all their data.
								</p>
								<p className="text-destructive font-medium">
									This action cannot be undone.
								</p>
							</div>
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={handleDelete}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={deleteMutation.isPending}
						>
							{deleteMutation.isPending ? (
								<LuLoaderCircle className="mr-2 h-4 w-4 animate-spin" />
							) : null}
							Delete Permanently
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
