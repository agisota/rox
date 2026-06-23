"use client";

import { toast } from "@rox/ui/sonner";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { useTRPC } from "@/trpc/react";

/**
 * Resolve (and, on demand, provision) the caller's routable `<handle>@rox.one`
 * address.
 *
 * The mail router exposes only an idempotent `mail.provisionAddress` mutation —
 * it both creates and re-affirms the address, returning the existing row when
 * present. We therefore call it once on mount to discover the address (safe:
 * idempotent, guarded by a global UNIQUE), and expose a manual `provision`
 * action for the "claim your address" affordance. A `PRECONDITION_FAILED` (no
 * handle set yet) surfaces as a soft error rather than a thrown crash.
 */
export function useMailAddress() {
	const trpc = useTRPC();
	const [address, setAddress] = useState<string | null>(null);
	const [needsHandle, setNeedsHandle] = useState(false);

	const provisionMutation = useMutation(
		trpc.mail.provisionAddress.mutationOptions({
			onSuccess: (row) => {
				setAddress(row?.address ?? null);
				setNeedsHandle(false);
			},
			onError: (error) => {
				if (error.data?.code === "PRECONDITION_FAILED") {
					setNeedsHandle(true);
					return;
				}
				console.error("[useMailAddress] provision failed", error);
				toast.error("Не удалось получить адрес почты");
			},
		}),
	);

	const provision = (handle?: string) => {
		provisionMutation.mutate(handle ? { handle } : {});
	};

	return {
		address,
		needsHandle,
		isProvisioning: provisionMutation.isPending,
		provision,
	};
}
