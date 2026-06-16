import type { RouterOutputs } from "@rox/trpc";
import { alert } from "@rox/ui/atoms/Alert";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "@rox/ui/empty";
import { Label } from "@rox/ui/label";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { Switch } from "@rox/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@rox/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rox/ui/tooltip";
import { useLiveQuery } from "@tanstack/react-db";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
	HiOutlineArrowPath,
	HiOutlineClipboardDocument,
	HiOutlineDocumentText,
	HiOutlineLink,
	HiOutlineNoSymbol,
	HiOutlineShare,
	HiOutlineTrash,
} from "react-icons/hi2";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import {
	findActiveArtifactShare,
	getArtifactDisplayTitle,
	sortArtifactsByNewest,
} from "./share-artifacts";

type PublicShare = RouterOutputs["share"]["listPublic"][number];

interface SharesSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

const PUBLIC_SHARES_QUERY_KEY = ["settings", "public-shares"] as const;

function formatDate(value: Date | string | null | undefined) {
	if (!value) return "-";
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return new Intl.DateTimeFormat("ru-RU", {
		day: "2-digit",
		month: "short",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function formatResourceType(type: PublicShare["resourceType"]) {
	return type === "chat_session" ? "Чат" : "Артефакт";
}

function getShareTitle(share: PublicShare) {
	return (
		share.title?.trim() ||
		`${formatResourceType(share.resourceType)} ${share.resourceId.slice(0, 8)}`
	);
}

export function SharesSettings({ visibleItems }: SharesSettingsProps) {
	const [includeRevoked, setIncludeRevoked] = useState(false);
	const [publishingArtifactId, setPublishingArtifactId] = useState<
		string | null
	>(null);
	const queryClient = useQueryClient();
	const collections = useCollections();
	const { copyToClipboard } = useCopyToClipboard();
	const showPublicShares = isItemVisible(
		SETTING_ITEM_ID.PUBLIC_SHARES,
		visibleItems,
	);

	const { data: artifactRows = [], isReady: artifactsReady } = useLiveQuery(
		(q) =>
			q.from({ artifacts: collections.artifacts }).select(({ artifacts }) => ({
				...artifacts,
			})),
		[collections],
	);

	const sharesQuery = useQuery({
		queryKey: [...PUBLIC_SHARES_QUERY_KEY, includeRevoked],
		queryFn: () => apiTrpcClient.share.listPublic.query({ includeRevoked }),
	});

	const revokeShare = useMutation({
		mutationFn: (id: string) => apiTrpcClient.share.revokePublic.mutate({ id }),
		onSuccess: () => {
			toast.success("Публичная ссылка отозвана");
			void queryClient.invalidateQueries({
				queryKey: PUBLIC_SHARES_QUERY_KEY,
			});
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: "Не удалось отозвать публичную ссылку",
			);
		},
	});

	const publishArtifact = useMutation({
		mutationFn: (artifactId: string) =>
			apiTrpcClient.share.publishArtifact.mutate({ artifactId }),
		onSuccess: async (result) => {
			await copyToClipboard(result.url);
			toast.success("Ссылка на артефакт скопирована");
			void queryClient.invalidateQueries({
				queryKey: PUBLIC_SHARES_QUERY_KEY,
			});
		},
		onError: (error) => {
			toast.error(
				error instanceof Error
					? error.message
					: "Не удалось создать публичную ссылку на артефакт",
			);
		},
		onSettled: () => {
			setPublishingArtifactId(null);
		},
	});

	const shares = useMemo(() => sharesQuery.data ?? [], [sharesQuery.data]);
	const artifacts = useMemo(
		() => sortArtifactsByNewest(artifactRows),
		[artifactRows],
	);
	const artifactsLoading = artifacts.length === 0 && !artifactsReady;
	const sharesLoading = sharesQuery.isLoading;

	const handleCopy = async (url: string) => {
		await copyToClipboard(url);
		toast.success("Ссылка скопирована");
	};

	const handleRevoke = (share: PublicShare) => {
		alert({
			title: "Отозвать публичную ссылку",
			description: `Ссылка "${getShareTitle(share)}" перестанет открываться для всех, у кого она уже есть.`,
			actions: [
				{ label: "Отмена", variant: "outline", onClick: () => {} },
				{
					label: "Отозвать",
					variant: "destructive",
					onClick: () => revokeShare.mutate(share.id),
				},
			],
		});
	};

	const handleShareArtifact = async (artifactId: string) => {
		const existingShare = findActiveArtifactShare(shares, artifactId);
		if (existingShare) {
			await handleCopy(existingShare.url);
			return;
		}

		setPublishingArtifactId(artifactId);
		publishArtifact.mutate(artifactId);
	};

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8 flex items-start justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold">Публичные ссылки</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Управляйте опубликованными snapshot-ссылками на чаты и артефакты.
					</p>
				</div>
				<div className="flex items-center gap-2 rounded-md border px-3 py-2">
					<Switch
						id="include-revoked-shares"
						checked={includeRevoked}
						onCheckedChange={setIncludeRevoked}
					/>
					<Label htmlFor="include-revoked-shares" className="text-sm">
						Отозванные
					</Label>
				</div>
			</div>

			{showPublicShares &&
				(sharesQuery.isLoading ? (
					<div className="space-y-3">
						<Skeleton className="h-10 w-full" />
						<Skeleton className="h-14 w-full" />
						<Skeleton className="h-14 w-full" />
						<Skeleton className="h-14 w-full" />
					</div>
				) : shares.length === 0 ? (
					<Empty className="border">
						<EmptyMedia variant="icon">
							<HiOutlineLink />
						</EmptyMedia>
						<EmptyTitle>Публичных ссылок нет</EmptyTitle>
						<EmptyDescription>
							Опубликованные чаты и артефакты появятся здесь после создания
							share-ссылки.
						</EmptyDescription>
					</Empty>
				) : (
					<div className="overflow-hidden rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Ресурс</TableHead>
									<TableHead>Дата</TableHead>
									<TableHead>Статус</TableHead>
									<TableHead className="w-[112px] text-right">
										Действия
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{shares.map((share) => {
									const isRevoked = Boolean(share.revokedAt);
									return (
										<TableRow key={share.id}>
											<TableCell className="max-w-[360px]">
												<div className="flex items-start gap-3">
													<HiOutlineLink className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
													<div className="min-w-0">
														<div className="truncate text-sm font-medium">
															{getShareTitle(share)}
														</div>
														<div className="mt-1 truncate font-mono text-xs text-muted-foreground">
															{share.url}
														</div>
													</div>
												</div>
											</TableCell>
											<TableCell className="whitespace-nowrap text-sm text-muted-foreground">
												{formatDate(share.createdAt)}
											</TableCell>
											<TableCell>
												<Badge variant={isRevoked ? "secondary" : "default"}>
													{isRevoked
														? "Отозвана"
														: formatResourceType(share.resourceType)}
												</Badge>
											</TableCell>
											<TableCell>
												<div className="flex justify-end gap-1">
													<Tooltip>
														<TooltipTrigger asChild>
															<Button
																type="button"
																size="icon-xs"
																variant="ghost"
																aria-label="Скопировать ссылку"
																onClick={() => void handleCopy(share.url)}
															>
																<HiOutlineClipboardDocument className="h-4 w-4" />
															</Button>
														</TooltipTrigger>
														<TooltipContent>Скопировать ссылку</TooltipContent>
													</Tooltip>
													<Tooltip>
														<TooltipTrigger asChild>
															<Button
																type="button"
																size="icon-xs"
																variant="ghost"
																aria-label="Отозвать ссылку"
																disabled={isRevoked || revokeShare.isPending}
																onClick={() => handleRevoke(share)}
															>
																{revokeShare.isPending ? (
																	<HiOutlineArrowPath className="h-4 w-4 animate-spin" />
																) : isRevoked ? (
																	<HiOutlineNoSymbol className="h-4 w-4" />
																) : (
																	<HiOutlineTrash className="h-4 w-4" />
																)}
															</Button>
														</TooltipTrigger>
														<TooltipContent>
															{isRevoked
																? "Ссылка уже отозвана"
																: "Отозвать ссылку"}
														</TooltipContent>
													</Tooltip>
												</div>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					</div>
				))}

			{showPublicShares ? (
				<section className="mt-10">
					<div className="mb-4">
						<h3 className="text-base font-medium">Артефакты</h3>
						<p className="mt-1 text-sm text-muted-foreground">
							Создавайте публичные snapshot-ссылки на сохраненные артефакты.
						</p>
					</div>

					{artifactsLoading ? (
						<div className="space-y-3">
							<Skeleton className="h-10 w-full" />
							<Skeleton className="h-14 w-full" />
							<Skeleton className="h-14 w-full" />
						</div>
					) : artifacts.length === 0 ? (
						<Empty className="border">
							<EmptyMedia variant="icon">
								<HiOutlineDocumentText />
							</EmptyMedia>
							<EmptyTitle>Артефактов пока нет</EmptyTitle>
							<EmptyDescription>
								Сохраненные workflow-артефакты появятся здесь после генерации.
							</EmptyDescription>
						</Empty>
					) : (
						<div className="overflow-hidden rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Артефакт</TableHead>
										<TableHead>Тип</TableHead>
										<TableHead>Дата</TableHead>
										<TableHead className="w-[132px] text-right">
											Действия
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{artifacts.map((artifact) => {
										const activeShare = findActiveArtifactShare(
											shares,
											artifact.id,
										);
										const isPublishing =
											publishingArtifactId === artifact.id &&
											publishArtifact.isPending;
										return (
											<TableRow key={artifact.id}>
												<TableCell className="max-w-[360px]">
													<div className="flex items-start gap-3">
														<HiOutlineDocumentText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
														<div className="min-w-0">
															<div className="truncate text-sm font-medium">
																{getArtifactDisplayTitle(artifact)}
															</div>
															<div className="mt-1 truncate font-mono text-xs text-muted-foreground">
																{artifact.id}
															</div>
														</div>
													</div>
												</TableCell>
												<TableCell>
													<Badge variant="secondary">{artifact.kind}</Badge>
												</TableCell>
												<TableCell className="whitespace-nowrap text-sm text-muted-foreground">
													{formatDate(artifact.createdAt)}
												</TableCell>
												<TableCell>
													<div className="flex justify-end">
														<Button
															type="button"
															size="xs"
															variant={activeShare ? "secondary" : "default"}
															disabled={isPublishing || sharesLoading}
															onClick={() =>
																void handleShareArtifact(artifact.id)
															}
														>
															{isPublishing ? (
																<HiOutlineArrowPath className="h-4 w-4 animate-spin" />
															) : activeShare ? (
																<HiOutlineClipboardDocument className="h-4 w-4" />
															) : (
																<HiOutlineShare className="h-4 w-4" />
															)}
															{activeShare ? "Копировать" : "Поделиться"}
														</Button>
													</div>
												</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						</div>
					)}
				</section>
			) : null}
		</div>
	);
}
