"use client";

import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { toast } from "@rox/ui/sonner";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GitBranch, Lock, RefreshCw, Unlock } from "lucide-react";
import { useTRPC } from "@/trpc/react";

interface RepositoryListProps {
	organizationId: string;
}

export function RepositoryList({ organizationId }: RepositoryListProps) {
	const trpc = useTRPC();

	const {
		data: repositories,
		isLoading,
		isError,
		refetch,
	} = useQuery(
		trpc.integration.github.listRepositories.queryOptions({
			organizationId,
		}),
	);

	const syncMutation = useMutation(
		trpc.integration.github.triggerSync.mutationOptions({
			onSuccess: () => {
				toast.success("Синхронизация запущена", {
					description: "Репозитории скоро обновятся.",
				});
				// Refetch after a short delay to allow sync to complete
				setTimeout(() => refetch(), 3000);
			},
			onError: (error) => {
				toast.error("Синхронизация не удалась", {
					description: error.message,
				});
			},
		}),
	);

	const handleSync = () => {
		syncMutation.mutate({ organizationId });
	};

	const isSyncing = syncMutation.isPending;

	if (isLoading) {
		return (
			<div className="py-8 text-center text-muted-foreground">
				Загружаем репозитории...
			</div>
		);
	}

	if (isError) {
		return (
			<div className="flex flex-col items-center gap-4 py-8">
				<p className="text-center text-muted-foreground">
					Не удалось загрузить репозитории. Попробуйте еще раз.
				</p>
				<Button onClick={() => refetch()} variant="outline">
					<RefreshCw className="mr-2 size-4" />
					Повторить
				</Button>
			</div>
		);
	}

	if (!repositories || repositories.length === 0) {
		return (
			<div className="flex flex-col items-center gap-4 py-8">
				<p className="text-center text-muted-foreground">
					Репозитории не найдены. Убедитесь, что GitHub App имеет доступ к
					репозиториям.
				</p>
				<Button onClick={handleSync} disabled={isSyncing} variant="outline">
					<RefreshCw
						className={`mr-2 size-4 ${isSyncing ? "animate-spin" : ""}`}
					/>
					{isSyncing ? "Синхронизируем..." : "Синхронизировать репозитории"}
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<p className="text-sm text-muted-foreground">
					Репозиториев: {repositories.length}
				</p>
				<Button
					onClick={handleSync}
					disabled={isSyncing}
					variant="outline"
					size="sm"
				>
					<RefreshCw
						className={`mr-2 size-3 ${isSyncing ? "animate-spin" : ""}`}
					/>
					{isSyncing ? "Синхронизируем..." : "Синхронизировать"}
				</Button>
			</div>
			<div className="space-y-2">
				{repositories.map((repo) => (
					<div
						key={repo.id}
						className="flex items-center justify-between rounded-lg border p-3"
					>
						<div className="flex items-center gap-3">
							{repo.isPrivate ? (
								<Lock className="size-4 text-muted-foreground" />
							) : (
								<Unlock className="size-4 text-muted-foreground" />
							)}
							<div>
								<p className="font-medium">{repo.fullName}</p>
								<div className="flex items-center gap-2 text-sm text-muted-foreground">
									<GitBranch className="size-3" />
									{repo.defaultBranch}
								</div>
							</div>
						</div>
						<Badge variant={repo.isPrivate ? "secondary" : "outline"}>
							{repo.isPrivate ? "Приватный" : "Публичный"}
						</Badge>
					</div>
				))}
			</div>
		</div>
	);
}
