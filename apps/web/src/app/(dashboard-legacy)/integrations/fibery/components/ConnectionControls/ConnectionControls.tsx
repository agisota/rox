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
	const [account, setAccount] = useState("");
	const [apiToken, setApiToken] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const disconnectMutation = useMutation(
		trpc.integration.fibery.disconnect.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.integration.fibery.getConnection.queryKey({
						organizationId,
					}),
				});
				router.refresh();
			},
		}),
	);

	const handleConnect = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const token = apiToken.trim();
		const subdomain = account.trim();
		if (!token || !subdomain) return;

		setIsSubmitting(true);
		try {
			const response = await fetch(
				`${env.NEXT_PUBLIC_API_URL}/api/integrations/fibery/connect`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({
						organizationId,
						apiToken: token,
						account: subdomain,
					}),
				},
			);

			if (!response.ok) {
				const data = (await response.json().catch(() => null)) as {
					error?: string;
				} | null;
				toast.error(data?.error ?? "Failed to connect Fibery.");
				return;
			}

			setApiToken("");
			setAccount("");
			await queryClient.invalidateQueries({
				queryKey: trpc.integration.fibery.getConnection.queryKey({
					organizationId,
				}),
			});
			router.refresh();
			toast.success("Fibery connected.");
		} catch {
			toast.error("Failed to connect Fibery.");
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
						<AlertDialogTitle>Disconnect Fibery?</AlertDialogTitle>
						<AlertDialogDescription>
							This will remove the connection between your organization and
							Fibery. You can reconnect at any time.
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
				<Label htmlFor="fibery-account">Account subdomain</Label>
				<Input
					id="fibery-account"
					autoComplete="off"
					placeholder="acme"
					value={account}
					onChange={(event) => setAccount(event.target.value)}
				/>
				<p className="text-xs text-muted-foreground">
					The part before <span className="font-mono">.fibery.io</span>.
				</p>
			</div>
			<div className="flex flex-col gap-2">
				<Label htmlFor="fibery-api-token">API token</Label>
				<Input
					id="fibery-api-token"
					type="password"
					autoComplete="off"
					placeholder="Settings → API Tokens"
					value={apiToken}
					onChange={(event) => setApiToken(event.target.value)}
				/>
			</div>
			<Button
				type="submit"
				disabled={isSubmitting || !apiToken.trim() || !account.trim()}
			>
				{isSubmitting ? "Connecting..." : "Connect Fibery"}
			</Button>
		</form>
	);
}
