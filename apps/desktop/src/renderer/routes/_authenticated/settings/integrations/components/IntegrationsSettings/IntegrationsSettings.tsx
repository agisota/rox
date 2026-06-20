import { Button } from "@rox/ui/button";
import { Skeleton } from "@rox/ui/skeleton";
import { useLiveQuery } from "@tanstack/react-db";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { FaBookOpen, FaComments } from "react-icons/fa";
import { HiOutlineArrowTopRightOnSquare } from "react-icons/hi2";
import {
	SiDiscord,
	SiGithub,
	SiLinear,
	SiNotion,
	SiObsidian,
	SiSlack,
	SiTelegram,
} from "react-icons/si";
import { env } from "renderer/env.renderer";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { logger } from "renderer/lib/logger";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	isItemVisible,
	type SettingItemId,
} from "../../../utils/settings-search";
import {
	getIntegrationSettingsRows,
	type IntegrationSettingsRow,
} from "./integration-settings-model";

interface IntegrationsSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

interface GithubInstallation {
	id: string;
	accountLogin: string | null;
	accountType: string | null;
	suspended: boolean | null;
	lastSyncedAt: Date | null;
	createdAt: Date;
}

const PROVIDER_ICONS: Record<IntegrationSettingsRow["provider"], ReactNode> = {
	linear: <SiLinear className="size-5" />,
	github: <SiGithub className="size-5" />,
	slack: <SiSlack className="size-5" />,
	telegram: <SiTelegram className="size-5" />,
	discord: <SiDiscord className="size-5" />,
	notion: <SiNotion className="size-5" />,
	obsidian: <SiObsidian className="size-5" />,
	fibery: <FaBookOpen className="size-5" />,
	lark: <FaComments className="size-5" />,
};

export function IntegrationsSettings({
	visibleItems,
}: IntegrationsSettingsProps) {
	const { data: session } = authClient.useSession();
	const activeOrganizationId = session?.session?.activeOrganizationId;
	const collections = useCollections();

	const { data: integrations } = useLiveQuery(
		(q) =>
			q
				.from({ integrationConnections: collections.integrationConnections })
				.select(({ integrationConnections }) => ({
					...integrationConnections,
				})),
		[collections],
	);

	const [githubInstallation, setGithubInstallation] =
		useState<GithubInstallation | null>(null);
	const [isLoadingGithub, setIsLoadingGithub] = useState(true);

	const fetchGithubInstallation = useCallback(async () => {
		if (!activeOrganizationId) {
			setIsLoadingGithub(false);
			return;
		}

		try {
			const result =
				await apiTrpcClient.integration.github.getInstallation.query({
					organizationId: activeOrganizationId,
				});
			setGithubInstallation(result);
		} catch (err) {
			logger.error("[integrations] Failed to fetch GitHub installation:", err);
		} finally {
			setIsLoadingGithub(false);
		}
	}, [activeOrganizationId]);

	useEffect(() => {
		fetchGithubInstallation();
	}, [fetchGithubInstallation]);

	const isGithubConnected =
		!!githubInstallation && !githubInstallation.suspended;
	const integrationRows = getIntegrationSettingsRows();

	const handleOpenWeb = (path: string) => {
		window.open(`${env.NEXT_PUBLIC_WEB_URL}${path}`, "_blank");
	};

	if (!activeOrganizationId) {
		return (
			<div className="p-6 max-w-4xl w-full">
				<div className="mb-8">
					<h2 className="text-xl font-semibold">Интеграции</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Подключите внешние сервисы для синхронизации данных.
					</p>
				</div>
				<p className="text-sm text-muted-foreground">
					Чтобы использовать интеграции, нужно состоять в организации.
				</p>
			</div>
		);
	}

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Интеграции</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Подключите внешние сервисы для синхронизации данных с вашей
					организацией.
				</p>
			</div>

			<div className="space-y-1">
				{integrationRows
					.filter((row) => isItemVisible(row.settingItemId, visibleItems))
					.map((row) => {
						const connection = integrations?.find(
							(integration) => integration.provider === row.provider,
						);
						const isGithub = row.provider === "github";
						return (
							<IntegrationRow
								key={row.provider}
								name={row.name}
								description={row.description}
								icon={PROVIDER_ICONS[row.provider]}
								isConnected={isGithub ? isGithubConnected : !!connection}
								connectedOrgName={
									isGithub
										? githubInstallation?.accountLogin
										: connection?.externalOrgName
								}
								isLoading={isGithub ? isLoadingGithub : false}
								onManage={() => handleOpenWeb(row.managePath)}
							/>
						);
					})}
			</div>

			<p className="mt-6 text-xs text-muted-foreground">
				Подключайте и настраивайте сервисы в веб-приложении.
			</p>
		</div>
	);
}

interface IntegrationRowProps {
	name: string;
	description: string;
	icon: ReactNode;
	isConnected: boolean;
	connectedOrgName?: string | null;
	isLoading?: boolean;
	onManage: () => void;
}

function IntegrationRow({
	name,
	description,
	icon,
	isConnected,
	connectedOrgName,
	isLoading,
	onManage,
}: IntegrationRowProps) {
	const status = isLoading ? (
		<Skeleton className="h-4 w-24" />
	) : (
		<div className="flex items-center gap-1.5">
			<span
				className={
					isConnected
						? "size-2 rounded-full bg-green-500"
						: "size-2 rounded-full bg-muted-foreground/30"
				}
			/>
			<span className="text-xs text-muted-foreground">
				{isConnected
					? connectedOrgName
						? `Подключено к ${connectedOrgName}`
						: "Подключено"
					: "Не подключено"}
			</span>
		</div>
	);

	return (
		<div className="flex items-center justify-between gap-8 py-3">
			<div className="flex items-center gap-3 min-w-0">
				<div className="flex size-8 shrink-0 items-center justify-center text-foreground">
					{icon}
				</div>
				<div className="min-w-0">
					<div className="text-sm font-medium">{name}</div>
					<div className="text-xs text-muted-foreground mt-0.5 truncate">
						{description}
					</div>
				</div>
			</div>
			<div className="flex items-center gap-3 shrink-0">
				{status}
				<Button
					variant="outline"
					size="sm"
					onClick={onManage}
					className="gap-2"
				>
					<HiOutlineArrowTopRightOnSquare className="size-4" />
					{isConnected ? "Управлять" : "Подключить"}
				</Button>
			</div>
		</div>
	);
}
