"use client";

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@rox/ui/card";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { FlagToggleRow } from "./components/FlagToggleRow";

interface FlagEntry {
	key: string;
	description: string;
	override: boolean | null;
	effective: boolean;
}

interface FeatureFlagsCardProps {
	userId: string;
	flags: FlagEntry[] | undefined;
	isLoading?: boolean;
}

export function FeatureFlagsCard({
	userId,
	flags,
	isLoading,
}: FeatureFlagsCardProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();

	const setFlag = useMutation(
		trpc.admin.setUserFlag.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.admin.getUserFlags.queryKey({ userId }),
				});
			},
			onError: (err) => {
				toast.error(`Failed to update flag: ${err.message}`);
			},
		}),
	);

	const rows = flags ?? [];

	return (
		<Card>
			<CardHeader>
				<CardTitle>Feature flags</CardTitle>
				<CardDescription>
					Per-user overrides — Force ON/OFF wins over PostHog; Inherit falls
					back to PostHog.
				</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading && rows.length === 0 ? (
					<div className="space-y-3">
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-10 w-full" />
					</div>
				) : rows.length === 0 ? (
					<p className="text-muted-foreground text-sm">No flags.</p>
				) : (
					<div className="divide-y">
						{rows.map((flag) => (
							<FlagToggleRow
								key={flag.key}
								flagKey={flag.key}
								description={flag.description}
								override={flag.override}
								effective={flag.effective}
								disabled={setFlag.isPending}
								onChange={(value) =>
									setFlag.mutate({ userId, key: flag.key, value })
								}
							/>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
