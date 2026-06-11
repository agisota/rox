import { Badge } from "@rox/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@rox/ui/card";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { FaGithub } from "react-icons/fa";
import { api } from "@/trpc/server";
import { ConnectionControls } from "./components/ConnectionControls";
import { ErrorHandler } from "./components/ErrorHandler";
import { RepositoryList } from "./components/RepositoryList";

export default async function GitHubIntegrationPage() {
	const trpc = await api();
	const organization = await trpc.user.myOrganization.query();

	if (!organization) {
		return (
			<div className="flex flex-col items-center justify-center py-16">
				<p className="text-muted-foreground">
					Чтобы использовать интеграции, нужно состоять в организации.
				</p>
			</div>
		);
	}

	const installation = await trpc.integration.github.getInstallation.query({
		organizationId: organization.id,
	});
	const isConnected = !!installation;

	return (
		<div className="space-y-8">
			<ErrorHandler />

			<Link
				href="/integrations"
				className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
			>
				<ArrowLeft className="size-4" />
				Назад к интеграциям
			</Link>

			<div className="flex items-start gap-6">
				<div className="flex size-16 items-center justify-center rounded-xl border bg-card p-3">
					<FaGithub className="size-10" />
				</div>
				<div className="flex-1">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-semibold">GitHub</h1>
						{isConnected ? (
							<Badge variant="default" className="gap-1">
								<CheckCircle2 className="size-3" />
								Подключено
							</Badge>
						) : (
							<Badge variant="secondary">Не подключено</Badge>
						)}
					</div>
					<p className="mt-1 text-muted-foreground">
						Подключите репозитории GitHub и синхронизируйте pull request.
						Отслеживайте статус CI и ревью в команде.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Подключение</CardTitle>
					<CardDescription>
						Установите Rox GitHub App, чтобы подключить репозитории.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ConnectionControls
						organizationId={organization.id}
						isConnected={isConnected}
					/>
					{installation && (
						<div className="mt-4 text-sm text-muted-foreground">
							Подключено к <strong>{installation.accountLogin}</strong> (
							{installation.accountType})
							{installation.suspended && (
								<Badge variant="destructive" className="ml-2">
									Приостановлено
								</Badge>
							)}
						</div>
					)}
				</CardContent>
			</Card>

			{installation && (
				<Card>
					<CardHeader>
						<CardTitle>Репозитории</CardTitle>
						<CardDescription>
							Репозитории, доступные через установленное приложение GitHub App.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<RepositoryList organizationId={organization.id} />
					</CardContent>
				</Card>
			)}
		</div>
	);
}
