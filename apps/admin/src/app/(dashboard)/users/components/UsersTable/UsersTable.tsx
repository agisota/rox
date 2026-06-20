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
import { Input } from "@rox/ui/input";
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
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	LuCoins,
	LuEllipsis,
	LuFlag,
	LuLoaderCircle,
	LuTrash2,
	LuUser,
} from "react-icons/lu";

import { useTRPC } from "@/trpc/react";

export function UsersTable() {
	const trpc = useTRPC();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");

	const { data, isLoading, error } = useQuery(
		trpc.admin.listUsers.queryOptions({
			q: search.trim() || undefined,
			limit: 50,
		}),
	);

	const [userToDelete, setUserToDelete] = useState<{
		id: string;
		email: string;
		name: string;
	} | null>(null);

	const deleteMutation = useMutation(
		trpc.admin.deleteUser.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.admin.listUsers.queryKey(),
				});
				toast.success(`${userToDelete?.name} has been deleted`);
				setUserToDelete(null);
			},
			onError: (error) => {
				toast.error(`Failed to delete user: ${error.message}`);
			},
		}),
	);

	const handleDelete = () => {
		if (!userToDelete) return;
		deleteMutation.mutate({ userId: userToDelete.id });
	};

	const users = data?.users ?? [];

	const searchBox = (
		<Input
			className="max-w-xs"
			placeholder="Search name or email…"
			value={search}
			onChange={(e) => setSearch(e.target.value)}
		/>
	);

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
					<div className="text-destructive mb-4">
						<svg
							aria-hidden="true"
							className="h-12 w-12"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
					</div>
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
				<CardHeader>
					<div className="flex items-center justify-between gap-4">
						<div>
							<CardTitle>Users</CardTitle>
							<CardDescription>
								{users.length} user{users.length !== 1 ? "s" : ""}
								{data?.nextCursor ? " (more available)" : ""}
							</CardDescription>
						</div>
						{searchBox}
					</div>
				</CardHeader>
				<CardContent>
					{users.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-12 text-center">
							<LuUser className="text-muted-foreground mb-4 h-12 w-12" />
							<p className="text-lg font-medium">No users found</p>
							<p className="text-muted-foreground text-sm">
								{search
									? "Try a different search."
									: "Users will appear here as they sign up"}
							</p>
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>User</TableHead>
									<TableHead>Email</TableHead>
									<TableHead>Joined</TableHead>
									<TableHead className="w-[50px]" />
								</TableRow>
							</TableHeader>
							<TableBody>
								{users.map((user) => (
									<TableRow
										key={user.id}
										className="hover:bg-muted/50 cursor-pointer"
										onClick={() => router.push(`/users/${user.id}`)}
									>
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
											<div className="text-sm">
												{formatDistanceToNow(new Date(user.createdAt), {
													addSuffix: true,
												})}
											</div>
										</TableCell>
										<TableCell onClick={(e) => e.stopPropagation()}>
											<DropdownMenu>
												<DropdownMenuTrigger asChild>
													<Button variant="ghost" className="h-8 w-8 p-0">
														<span className="sr-only">Open menu</span>
														<LuEllipsis className="h-4 w-4" />
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem
														onClick={() => router.push(`/users/${user.id}`)}
													>
														<LuCoins className="mr-2 h-4 w-4" />
														Top up
													</DropdownMenuItem>
													<DropdownMenuItem
														onClick={() => router.push(`/users/${user.id}`)}
													>
														<LuFlag className="mr-2 h-4 w-4" />
														Manage flags
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
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

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
