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
	const [botToken, setBotToken] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const disconnectMutation = useMutation(
		trpc.integration.telegram.disconnect.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.integration.telegram.getConnection.queryKey({
						organizationId,
					}),
				});
				router.refresh();
			},
		}),
	);

	const handleConnect = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const token = botToken.trim();
		if (!token) return;

		setIsSubmitting(true);
		try {
			const response = await fetch(
				`${env.NEXT_PUBLIC_API_URL}/api/integrations/telegram/connect`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					credentials: "include",
					body: JSON.stringify({ organizationId, botToken: token }),
				},
			);

			if (!response.ok) {
				const data = (await response.json().catch(() => null)) as {
					error?: string;
				} | null;
				toast.error(data?.error ?? "Failed to connect Telegram.");
				return;
			}

			setBotToken("");
			await queryClient.invalidateQueries({
				queryKey: trpc.integration.telegram.getConnection.queryKey({
					organizationId,
				}),
			});
			router.refresh();
			toast.success("Telegram connected.");
		} catch {
			toast.error("Failed to connect Telegram.");
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
						<AlertDialogTitle>Disconnect Telegram?</AlertDialogTitle>
						<AlertDialogDescription>
							This will remove the connection between your organization and
							Telegram. You can reconnect at any time.
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
				<Label htmlFor="telegram-bot-token">Bot token</Label>
				<Input
					id="telegram-bot-token"
					type="password"
					autoComplete="off"
					placeholder="123456:ABC-DEF..."
					value={botToken}
					onChange={(event) => setBotToken(event.target.value)}
				/>
				<p className="text-xs text-muted-foreground">
					Create a bot with @BotFather and paste the token here.
				</p>
			</div>
			<Button type="submit" disabled={isSubmitting || !botToken.trim()}>
				{isSubmitting ? "Connecting..." : "Connect Telegram"}
			</Button>
		</form>
	);
}
