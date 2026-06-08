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
import { toast } from "@rox/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuLoaderCircle, LuPlus } from "react-icons/lu";

import { useTRPC } from "@/trpc/react";

function slugify(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

export function CreateOrganizationDialog() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [slugTouched, setSlugTouched] = useState(false);

	const createMutation = useMutation(
		trpc.admin.createOrganization.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.admin.listOrganizations.queryKey(),
				});
				queryClient.invalidateQueries({
					queryKey: trpc.admin.getStats.queryKey(),
				});
				toast.success("Organization created");
				setName("");
				setSlug("");
				setSlugTouched(false);
				setOpen(false);
			},
			onError: (error) => {
				toast.error(`Failed to create organization: ${error.message}`);
			},
		}),
	);

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		createMutation.mutate({
			name: name.trim(),
			slug: (slugTouched ? slug : slugify(name)).trim(),
		});
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm">
					<LuPlus className="mr-2 h-4 w-4" />
					Create organization
				</Button>
			</DialogTrigger>
			<DialogContent>
				<form onSubmit={handleSubmit}>
					<DialogHeader>
						<DialogTitle>Create organization</DialogTitle>
						<DialogDescription>
							Create a new organization. The slug must be unique.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="space-y-2">
							<Label htmlFor="create-org-name">Name</Label>
							<Input
								id="create-org-name"
								required
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="Acme Inc."
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="create-org-slug">Slug</Label>
							<Input
								id="create-org-slug"
								required
								value={slugTouched ? slug : slugify(name)}
								onChange={(e) => {
									setSlugTouched(true);
									setSlug(e.target.value);
								}}
								placeholder="acme"
							/>
						</div>
					</div>
					<DialogFooter>
						<Button type="submit" disabled={createMutation.isPending}>
							{createMutation.isPending ? (
								<LuLoaderCircle className="mr-2 h-4 w-4 animate-spin" />
							) : null}
							Create
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
