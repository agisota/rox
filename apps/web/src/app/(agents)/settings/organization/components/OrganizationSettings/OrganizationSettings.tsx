"use client";

import { authClient } from "@rox/auth/client";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useTRPC } from "@/trpc/react";

/**
 * Web parity for the desktop organization settings (Hermes-borrow F27). Owners
 * can rename the organization; the slug is shown read-only (slug changes stay a
 * deliberate action surfaced on desktop). Reads via `organization.getActive`,
 * writes via `organization.update`.
 */
export function OrganizationSettings() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data: activeOrg } = authClient.useActiveOrganization();
	const currentUserId = useCurrentUserId();

	const orgQuery = useQuery(trpc.organization.getActive.queryOptions());
	const organization = orgQuery.data;

	const isOwner =
		activeOrg?.members?.find((m) => m.userId === currentUserId)?.role ===
		"owner";

	const [nameValue, setNameValue] = useState("");

	useEffect(() => {
		if (organization) setNameValue(organization.name);
	}, [organization]);

	const updateMutation = useMutation(
		trpc.organization.update.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.organization.getActive.queryKey(),
				});
				toast.success("Название организации обновлено");
			},
			onError: (error) => {
				toast.error(error.message || "Не удалось обновить название");
				if (organization) setNameValue(organization.name);
			},
		}),
	);

	const handleNameBlur = () => {
		if (!organization || nameValue === organization.name) return;
		if (!nameValue) {
			setNameValue(organization.name);
			return;
		}
		updateMutation.mutate({ id: organization.id, name: nameValue });
	};

	if (orgQuery.isLoading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-9 w-72" />
				<Skeleton className="h-9 w-72" />
			</div>
		);
	}

	if (!organization) {
		return (
			<p className="text-muted-foreground text-sm">Организация не выбрана.</p>
		);
	}

	return (
		<section className="space-y-6">
			<div className="space-y-2">
				<Label htmlFor="org-name">Название</Label>
				<Input
					id="org-name"
					value={nameValue}
					onChange={(e) => setNameValue(e.target.value)}
					onBlur={handleNameBlur}
					placeholder="Acme Inc."
					className="w-72"
					disabled={!isOwner}
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor="org-slug">Slug</Label>
				<Input
					id="org-slug"
					value={organization.slug}
					readOnly
					className="w-72 font-mono text-xs"
					disabled
				/>
				<p className="text-muted-foreground text-xs">
					Используется в URL и API.
				</p>
			</div>

			{!isOwner && (
				<p className="text-muted-foreground text-xs">
					Изменять эти настройки могут только владельцы организации.
				</p>
			)}
		</section>
	);
}

function useCurrentUserId(): string | undefined {
	const { data: session } = authClient.useSession();
	return session?.user?.id;
}
