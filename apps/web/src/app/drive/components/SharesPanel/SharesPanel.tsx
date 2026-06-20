"use client";

import { Button } from "@rox/ui/button";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Lock } from "lucide-react";
import { env } from "@/env";
import { useTRPC } from "@/trpc/react";
import { buildShareUrl } from "../../utils/buildShareUrl";

/**
 * Active public shares with copy + revoke. Cache-first: renders the last known
 * shares immediately; skeleton only while there is no data and the query is
 * still loading. Revoked rows are filtered out (the server stamps `revokedAt`).
 */
export function SharesPanel() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const shares = useQuery(trpc.drive.listShares.queryOptions());

	const revokeShare = useMutation(
		trpc.drive.revokeShare.mutationOptions({
			onSuccess: async () => {
				await queryClient.invalidateQueries({
					queryKey: trpc.drive.listShares.queryKey(),
				});
				toast.success("Ссылка отозвана");
			},
			onError: (error) => {
				toast.error(error.message || "Не удалось отозвать ссылку");
			},
		}),
	);

	if (!shares.data) {
		if (shares.isLoading) {
			return <Skeleton className="h-24 w-full rounded-lg" />;
		}
		return null;
	}

	const active = shares.data.filter((share) => !share.revokedAt);

	if (active.length === 0) {
		return (
			<p className="text-muted-foreground text-sm">Пока нет активных ссылок.</p>
		);
	}

	const copy = async (token: string) => {
		try {
			await navigator.clipboard.writeText(
				buildShareUrl(token, env.NEXT_PUBLIC_WEB_URL),
			);
			toast.success("Ссылка скопирована");
		} catch {
			toast.error("Не удалось скопировать ссылку");
		}
	};

	return (
		<ul className="divide-y rounded-lg border">
			{active.map((share) => (
				<li key={share.id} className="flex items-center gap-3 p-3">
					<Link2 className="size-4 shrink-0 text-muted-foreground" />
					<div className="min-w-0 flex-1">
						<p className="truncate font-medium text-sm">/d/{share.token}</p>
						<p className="flex items-center gap-2 text-muted-foreground text-xs">
							<span>{share.fileId ? "Файл" : "Папка"}</span>
							{share.passwordHash ? (
								<span className="inline-flex items-center gap-1">
									<Lock className="size-3" /> пароль
								</span>
							) : null}
							<span>· просмотров: {share.viewCount}</span>
						</p>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-label="Скопировать ссылку"
						onClick={() => copy(share.token)}
					>
						<Copy className="size-4" />
					</Button>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={revokeShare.isPending}
						onClick={() => revokeShare.mutate({ shareId: share.id })}
					>
						Отозвать
					</Button>
				</li>
			))}
		</ul>
	);
}
