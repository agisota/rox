"use client";

import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@rox/ui/alert-dialog";
import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { toast } from "@rox/ui/sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

interface ConnectionControlsProps {
	organizationId: string;
	isConnected: boolean;
}

export function ConnectionControls({
	organizationId,
	isConnected,
}: ConnectionControlsProps) {
	const trpc = useTRPC();
	const router = useRouter();
	const queryClient = useQueryClient();
	const [restApiToken, setRestApiToken] = useState("");
	const [vaultName, setVaultName] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const disconnectMutation = useMutation(
		trpc.integration.obsidian.disconnect.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.integration.obsidian.getConnection.queryKey({
						organizationId,
					}),
				});
				router.refresh();
			},
		}),
	);

	const handleConnect = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const token = restApiToken.trim();
		if (!token) return;

		setIsSubmitting(true);
		try {
			const vault = vaultName.trim();
			const response = await fetch(
				`${env.NEXT_PUBLIC_API_URL}/api/integrations/obsidian/connect`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({
						organizationId,
						restApiToken: token,
						...(vault ? { vaultName: vault } : {}),
					}),
				},
			);

			if (!response.ok) {
				const data = (await response.json().catch(() => null)) as {
					error?: string;
				} | null;
				toast.error(data?.error ?? "Failed to connect Obsidian.");
				return;
			}

			setRestApiToken("");
			setVaultName("");
			await queryClient.invalidateQueries({
				queryKey: trpc.integration.obsidian.getConnection.queryKey({
					organizationId,
				}),
			});
			router.refresh();
			toast.success("Obsidian connected.");
		} catch {
			toast.error("Failed to connect Obsidian.");
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleDisconnect = () => {
		disconnectMutation.mutate({ organizationId });
	};

	if (isConnected) {
		return (
			<AlertDialog>
				<AlertDialogTrigger asChild>
					<Button variant="outline" disabled={disconnectMutation.isPending}>
						<Unplug className="mr-2 size-4" />
						{disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Disconnect Obsidian?</AlertDialogTitle>
						<AlertDialogDescription>
							This will remove the stored Local REST API token for your
							organization. You can reconnect at any time.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={handleDisconnect}>
							Disconnect
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		);
	}

	return (
		<form onSubmit={handleConnect} className="flex max-w-md flex-col gap-3">
			<div className="flex flex-col gap-2">
				<Label htmlFor="obsidian-token">Local REST API token</Label>
				<Input
					id="obsidian-token"
					type="password"
					autoComplete="off"
					placeholder="From the Local REST API plugin"
					value={restApiToken}
					onChange={(event) => setRestApiToken(event.target.value)}
				/>
				<p className="text-xs text-muted-foreground">
					Install the Local REST API community plugin in Obsidian and copy its
					API key.
				</p>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="obsidian-vault">Vault name (optional)</Label>
				<Input
					id="obsidian-vault"
					autoComplete="off"
					placeholder="My Vault"
					value={vaultName}
					onChange={(event) => setVaultName(event.target.value)}
				/>
			</div>
			<Button type="submit" disabled={isSubmitting || !restApiToken.trim()}>
				{isSubmitting ? "Connecting..." : "Connect Obsidian"}
			</Button>
		</form>
	);
}
