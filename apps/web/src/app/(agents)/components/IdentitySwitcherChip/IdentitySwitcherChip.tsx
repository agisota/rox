"use client";

import { authClient } from "@rox/auth/client";
import { IdentitySwitcher } from "@rox/ui/atoms/IdentitySwitcher";
import {
	type ProfileDetail,
	ProfileDetailCard,
} from "@rox/ui/atoms/ProfileDetailCard";
import { toast } from "@rox/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

/**
 * Resolve a persona row's opaque `theme_json` (F21) into the typed fields the
 * detail card renders. Tolerant by design — unknown/partial themes degrade to
 * `null` rather than throwing, since the theme is intentionally free-form
 * (personas-schema `passthrough`).
 */
function resolvePersonaTheme(theme: unknown): {
	model: string | null;
	gateway: string | null;
	provider: string | null;
	skills: readonly string[] | null;
} {
	const t =
		theme && typeof theme === "object"
			? (theme as Record<string, unknown>)
			: {};
	const asString = (v: unknown) => (typeof v === "string" ? v : null);
	const skills = Array.isArray(t.skills)
		? t.skills.filter((s): s is string => typeof s === "string")
		: null;
	return {
		model: asString(t.model),
		gateway: asString(t.gateway),
		provider: asString(t.provider),
		skills: skills && skills.length > 0 ? skills : null,
	};
}

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

	// F23: resolve the active persona's theme into the detail-card props so the
	// dropdown shows Status / Gateway / Model / Provider / Skills / Default space.
	const theme = activePersona
		? resolvePersonaTheme(activePersona.themeJson)
		: null;
	const detail: ProfileDetail | null =
		activePersona && theme
			? {
					id: activePersona.id,
					displayName: activePersona.displayName,
					handle: activePersona.handle,
					avatarUrl: activePersona.avatarUrl,
					accentColor: activePersona.accentColor,
					// Read-only display (F23); F47 owns live gateway/skills mutations.
					// The online flag is derived from a resolved gateway until the
					// gateway health surface lands.
					gateway: theme.gateway,
					gatewayOnline: Boolean(theme.gateway),
					model: theme.model,
					provider: theme.provider,
					skills: theme.skills ?? undefined,
					defaultSpace: session?.session?.activeOrganizationId ?? null,
				}
			: null;

	return (
		<IdentitySwitcher
			className={className}
			personas={personas ?? []}
			activeId={activePersona?.id ?? null}
			loading={personasLoading || activeLoading || setActive.isPending}
			detail={detail ? <ProfileDetailCard persona={detail} /> : undefined}
			onSelect={(personaId) => {
				if (personaId === activePersona?.id) {
					return;
				}
				setActive.mutate({ personaId });
			}}
		/>
	);
}
