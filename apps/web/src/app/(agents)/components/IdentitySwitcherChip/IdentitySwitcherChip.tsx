"use client";

import { authClient } from "@rox/auth/client";
import { IdentitySwitcher } from "@rox/ui/atoms/IdentitySwitcher";
import { toast } from "@rox/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

/**
 * Web container for the persona switcher chip (Hermes-borrow F22). Forks the
 * org-switcher pattern from {@link import("../AgentsHeader").AgentsHeader} but
 * retargets it at the active-persona pointer (F21): it feeds the presentational
 * `@rox/ui` `IdentitySwitcher` atom live `personas.list` data, marks the active
 * persona from `personas.getActive`, and on select calls `personas.setActive`
 * — the cross-device active-persona pointer (micro-decision #2). The chip is the
 * cross-platform core; mobile renders the same atom from the same tRPC surface.
 *
 * Mounted in the composer toolbar (`footerTools`) as the identity anchor. Only
 * queries once an active org exists so the request is never sent before sign-in
 * completes, mirroring `AgentsHeader`'s persona query gate.
 */
export function IdentitySwitcherChip({ className }: { className?: string }) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { data: session } = authClient.useSession();
	const activeOrganizationId = session?.session?.activeOrganizationId;

	const enabled = Boolean(activeOrganizationId);

	const { data: personas, isLoading: personasLoading } = useQuery({
		...trpc.personas.list.queryOptions(),
		enabled,
	});
	const { data: activePersona, isLoading: activeLoading } = useQuery({
		...trpc.personas.getActive.queryOptions(),
		enabled,
	});

	const setActive = useMutation(
		trpc.personas.setActive.mutationOptions({
			onSuccess: async () => {
				// Refresh the active-persona pointer (and any persona-driven surfaces)
				// across the app so every chip/card reflects the new active persona.
				await queryClient.invalidateQueries({
					queryKey: trpc.personas.getActive.queryKey(),
				});
			},
			onError: (error) => {
				console.error(
					"[IdentitySwitcherChip] Failed to set active persona",
					error,
				);
				toast.error("Не удалось сменить персону. Попробуйте ещё раз.");
			},
		}),
	);

	// No personas yet (or signed-out): render nothing so the composer toolbar
	// stays clean rather than showing an inert, empty chip.
	if (!enabled || (!personasLoading && (personas?.length ?? 0) === 0)) {
		return null;
	}

	return (
		<IdentitySwitcher
			className={className}
			personas={personas ?? []}
			activeId={activePersona?.id ?? null}
			loading={personasLoading || activeLoading || setActive.isPending}
			onSelect={(personaId) => {
				if (personaId === activePersona?.id) {
					return;
				}
				setActive.mutate({ personaId });
			}}
		/>
	);
}
