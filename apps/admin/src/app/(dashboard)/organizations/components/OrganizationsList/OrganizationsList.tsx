"use client";

import type { RouterOutputs } from "@rox/trpc";
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
	Dialog,
	DialogContent,
	DialogFooter,
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
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { toast } from "@rox/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
	LuEllipsis,
	LuLoaderCircle,
	LuPencil,
	LuTrash2,
	LuUserMinus,
	LuUserPlus,
} from "react-icons/lu";

import { useTRPC } from "@/trpc/react";

type Organization = RouterOutputs["admin"]["listOrganizations"][number];

export function OrganizationsList() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data, isLoading, error } = useQuery(
		trpc.admin.listOrganizations.queryOptions(),
	);

	const [orgToRename, setOrgToRename] = useState<Organization | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [orgToDelete, setOrgToDelete] = useState<Organization | null>(null);
	const [addMemberId, setAddMemberId] = useState<Record<string, string>>({});

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.admin.listOrganizations.queryKey(),
		});

	const renameMutation = useMutation(
		trpc.admin.renameOrganization.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast.success("Organization renamed");
				setOrgToRename(null);
			},
			onError: (e) => toast.error(`Rename failed: ${e.message}`),
		}),
	);

	const deleteMutation = useMutation(
		trpc.admin.deleteOrganization.mutationOptions({
			onSuccess: () => {
				invalidate();
				queryClient.invalidateQueries({
					queryKey: trpc.admin.getStats.queryKey(),
				});
				toast.success("Organization deleted");
				setOrgToDelete(null);
			},
			onError: (e) => toast.error(`Delete failed: ${e.message}`),
		}),
	);

	const addMemberMutation = useMutation(
		trpc.admin.addMember.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast.success("Member added");
			},
			onError: (e) => toast.error(`Add member failed: ${e.message}`),
		}),
	);

	const removeMemberMutation = useMutation(
		trpc.admin.removeMember.mutationOptions({
			onSuccess: () => {
				invalidate();
				toast.success("Member removed");
			},
			onError: (e) => toast.error(`Remove member failed: ${e.message}`),
		}),
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
				<CardContent className="py-12 text-center">
					<p className="text-lg font-medium">Failed to load organizations</p>
					<p className="text-muted-foreground text-sm">{error.message}</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<>
			<div className="space-y-4">
				{(data ?? []).map((org) => (
					<Card key={org.id}>
						<CardHeader className="flex flex-row items-start justify-between">
							<div>
								<CardTitle className="flex items-center gap-2">
									{org.name}
									<Badge variant="secondary">{org.slug}</Badge>
								</CardTitle>
								<CardDescription>
									{org.memberCount} member{org.memberCount !== 1 ? "s" : ""}
								</CardDescription>
							</div>
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" className="h-8 w-8 p-0">
										<span className="sr-only">Open menu</span>
										<LuEllipsis className="h-4 w-4" />
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<DropdownMenuItem
										onClick={() => {
											setOrgToRename(org);
											setRenameValue(org.name);
										}}
									>
										<LuPencil className="mr-2 h-4 w-4" />
										Rename
									</DropdownMenuItem>
									<DropdownMenuSeparator />
									<DropdownMenuItem
										className="text-destructive focus:text-destructive"
										onClick={() => setOrgToDelete(org)}
									>
										<LuTrash2 className="mr-2 h-4 w-4" />
										Delete
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</CardHeader>
						<CardContent className="space-y-3">
							<div className="space-y-2">
								{org.members.map((member) => (
									<div
										key={member.memberId}
										className="flex items-center justify-between gap-2"
									>
										<div className="flex items-center gap-2">
											<Avatar className="h-7 w-7">
												<AvatarImage src={member.image ?? undefined} />
												<AvatarFallback>
													{member.name.slice(0, 2).toUpperCase()}
												</AvatarFallback>
											</Avatar>
											<div className="text-sm">
												<span className="font-medium">{member.name}</span>{" "}
												<span className="text-muted-foreground">
													{member.email}
												</span>
											</div>
											<Badge variant="outline">{member.role}</Badge>
										</div>
										<Button
											variant="ghost"
											size="sm"
											onClick={() =>
												removeMemberMutation.mutate({
													organizationId: org.id,
													userId: member.userId,
												})
											}
										>
											<LuUserMinus className="h-4 w-4" />
											<span className="sr-only">Remove member</span>
										</Button>
									</div>
								))}
							</div>
							<div className="flex items-end gap-2 border-t pt-3">
								<div className="flex-1 space-y-1">
									<Label htmlFor={`add-member-${org.id}`} className="text-xs">
										Add member by user ID
									</Label>
									<Input
										id={`add-member-${org.id}`}
										value={addMemberId[org.id] ?? ""}
										onChange={(e) =>
											setAddMemberId((prev) => ({
												...prev,
												[org.id]: e.target.value,
											}))
										}
										placeholder="user uuid"
									/>
								</div>
								<Button
									variant="secondary"
									disabled={
										!(addMemberId[org.id] ?? "").trim() ||
										addMemberMutation.isPending
									}
									onClick={() => {
										addMemberMutation.mutate({
											organizationId: org.id,
											userId: (addMemberId[org.id] ?? "").trim(),
											role: "member",
										});
										setAddMemberId((prev) => ({ ...prev, [org.id]: "" }));
									}}
								>
									<LuUserPlus className="mr-2 h-4 w-4" />
									Add
								</Button>
							</div>
						</CardContent>
					</Card>
				))}
				{(data ?? []).length === 0 && (
					<Card>
						<CardContent className="py-12 text-center">
							<p className="text-lg font-medium">No organizations yet</p>
						</CardContent>
					</Card>
				)}
			</div>

			<Dialog
				open={!!orgToRename}
				onOpenChange={(open) => !open && setOrgToRename(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Rename organization</DialogTitle>
					</DialogHeader>
					<div className="space-y-2 py-2">
						<Label htmlFor="rename-org">Name</Label>
						<Input
							id="rename-org"
							value={renameValue}
							onChange={(e) => setRenameValue(e.target.value)}
						/>
					</div>
					<DialogFooter>
						<Button
							disabled={!renameValue.trim() || renameMutation.isPending}
							onClick={() => {
								if (!orgToRename) return;
								renameMutation.mutate({
									organizationId: orgToRename.id,
									name: renameValue.trim(),
								});
							}}
						>
							{renameMutation.isPending ? (
								<LuLoaderCircle className="mr-2 h-4 w-4 animate-spin" />
							) : null}
							Save
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<AlertDialog
				open={!!orgToDelete}
				onOpenChange={(open) => !open && setOrgToDelete(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete organization?</AlertDialogTitle>
						<AlertDialogDescription>
							This permanently deletes <strong>{orgToDelete?.name}</strong> and
							removes all its members, teams and invitations. This cannot be
							undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={deleteMutation.isPending}
							onClick={() => {
								if (!orgToDelete) return;
								deleteMutation.mutate({ organizationId: orgToDelete.id });
							}}
						>
							{deleteMutation.isPending ? (
								<LuLoaderCircle className="mr-2 h-4 w-4 animate-spin" />
							) : null}
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	);
}
