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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";

interface ConnectionControlsProps {
	organizationId: string;
	isConnected: boolean;
	needsReconnect?: boolean;
}

export function ConnectionControls({
	organizationId,
	isConnected,
	needsReconnect = false,
}: ConnectionControlsProps) {
	const trpc = useTRPC();
	const router = useRouter();
	const queryClient = useQueryClient();

	const disconnectMutation = useMutation(
		trpc.integration.linear.disconnect.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: trpc.integration.linear.getConnection.queryKey({
						organizationId,
					}),
				});
				router.refresh();
			},
		}),
	);

	const handleConnect = () => {
		window.location.href = `${env.NEXT_PUBLIC_API_URL}/api/integrations/linear/connect?organizationId=${organizationId}`;
	};

	const handleDisconnect = () => {
		disconnectMutation.mutate({ organizationId });
	};

	if (isConnected && needsReconnect) {
		return (
			<div className="space-y-3">
				<div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
					<AlertTriangle className="mt-0.5 size-4 shrink-0" />
					<div>
						Авторизация Linear истекла. Переподключитесь, чтобы продолжить
						синхронизацию.
					</div>
				</div>
				<div className="flex gap-2">
					<Button variant="destructive" onClick={handleConnect}>
						Переподключить Linear
					</Button>
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button variant="outline" disabled={disconnectMutation.isPending}>
								<Unplug className="mr-2 size-4" />
								{disconnectMutation.isPending ? "Отключаем..." : "Отключить"}
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Отключить Linear?</AlertDialogTitle>
								<AlertDialogDescription>
									Это удалит подключение между вашей организацией и Linear.
									Подключение можно восстановить в любой момент.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Отмена</AlertDialogCancel>
								<AlertDialogAction onClick={handleDisconnect}>
									Отключить
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</div>
		);
	}

	if (isConnected) {
		return (
			<AlertDialog>
				<AlertDialogTrigger asChild>
					<Button variant="outline" disabled={disconnectMutation.isPending}>
						<Unplug className="mr-2 size-4" />
						{disconnectMutation.isPending ? "Отключаем..." : "Отключить"}
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Отключить Linear?</AlertDialogTitle>
						<AlertDialogDescription>
							Это удалит подключение между вашей организацией и Linear.
							Подключение можно восстановить в любой момент.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Отмена</AlertDialogCancel>
						<AlertDialogAction onClick={handleDisconnect}>
							Отключить
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		);
	}

	return <Button onClick={handleConnect}>Подключить Linear</Button>;
}
