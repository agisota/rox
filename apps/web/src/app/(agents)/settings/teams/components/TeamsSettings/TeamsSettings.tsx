"use client";

import { authClient } from "@rox/auth/client";
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
import { TeamCard } from "@rox/ui/org-management";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "@/trpc/react";

function slugify(value: string): string {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function formatDate(date: Date | string): string {
	const d = date instanceof Date ? date : new Date(date);
	return d.toLocaleDateString("ru-RU", { month: "short", day: "numeric" });
}

/**
 * Web parity for the desktop teams panel (Hermes-borrow F27). Lists teams over
 * `trpc.team.list` (web has no Electric) and creates them via better-auth
 * `authClient.organization.createTeam`, mirroring the desktop flow. Team rows
 * render with the lifted `@rox/ui/org-management` TeamCard.
 */
export function TeamsSettings() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data: session } = authClient.useSession();
	const activeOrganizationId = session?.session?.activeOrganizationId;

	const teamsQuery = useQuery(trpc.team.list.queryOptions());
	const teams = teamsQuery.data ?? [];

	const [createOpen, setCreateOpen] = useState(false);
	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");

	const createMutation = useMutation({
		mutationFn: async (input: { name: string; slug: string }) => {
			if (!activeOrganizationId) {
				throw new Error("Организация не выбрана");
			}
			const result = await authClient.organization.createTeam({
				name: input.name,
				slug: input.slug,
				organizationId: activeOrganizationId,
			});
			if (result.error) {
				throw new Error(result.error.message || "Не удалось создать команду");
			}
			return result.data;
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: trpc.team.list.queryKey() });
			toast.success("Команда создана");
			setCreateOpen(false);
			setName("");
			setSlug("");
		},
		onError: (error) => {
			toast.error(
				error instanceof Error ? error.message : "Не удалось создать команду",
			);
		},
	});

	const handleNameChange = (value: string) => {
		setName(value);
		setSlug(slugify(value));
	};

	return (
		<section>
			<div className="mb-4 flex items-end justify-between gap-4">
				<div>
					<h2 className="font-medium text-lg">Команды</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						Организуйте работу по командам внутри организации.
					</p>
				</div>
				{activeOrganizationId && (
					<Button onClick={() => setCreateOpen(true)}>Создать команду</Button>
				)}
			</div>

			{teamsQuery.isLoading ? (
				<div className="space-y-2 rounded-lg border p-4">
					{[0, 1, 2].map((i) => (
						<Skeleton key={i} className="h-10 w-full" />
					))}
				</div>
			) : teams.length === 0 ? (
				<div className="rounded-lg border py-12 text-center text-muted-foreground text-sm">
					Команд пока нет.
				</div>
			) : (
				<div className="divide-y rounded-lg border">
					{teams.map((team) => (
						<TeamCard
							key={team.id}
							name={team.name}
							subtitle={`Создана ${formatDate(team.createdAt)}`}
						/>
					))}
				</div>
			)}

			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Создать команду</DialogTitle>
						<DialogDescription>
							Команды помогают разделить работу внутри организации.
						</DialogDescription>
					</DialogHeader>
					<form
						className="space-y-4 py-4"
						onSubmit={(event) => {
							event.preventDefault();
							if (!name || createMutation.isPending) return;
							createMutation.mutate({ name, slug });
						}}
					>
						<div className="space-y-2">
							<Label htmlFor="team-name">Название</Label>
							<Input
								id="team-name"
								value={name}
								onChange={(e) => handleNameChange(e.target.value)}
								placeholder="Платформа"
								disabled={createMutation.isPending}
							/>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setCreateOpen(false)}
								disabled={createMutation.isPending}
							>
								Отмена
							</Button>
							<Button
								type="submit"
								disabled={createMutation.isPending || !name}
							>
								{createMutation.isPending ? "Создаём..." : "Создать"}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</section>
	);
}
