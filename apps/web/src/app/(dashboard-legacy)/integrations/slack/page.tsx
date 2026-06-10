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
import { FaSlack } from "react-icons/fa";
import { api } from "@/trpc/server";
import { ConnectionControls } from "./components/ConnectionControls";
import { ErrorHandler } from "./components/ErrorHandler";

export default async function SlackIntegrationPage() {
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

	const connection = await trpc.integration.slack.getConnection.query({
		organizationId: organization.id,
	});
	const isConnected = !!connection;

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
					<FaSlack className="size-10" />
				</div>
				<div className="flex-1">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-semibold">Slack</h1>
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
						Подключите Slack, чтобы управлять задачами из переписок. Упомяните
						бота в любом канале или напишите ему в личные сообщения, чтобы
						создавать и обновлять задачи.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Подключение</CardTitle>
					<CardDescription>
						Подключите воркспейс Slack, чтобы управлять задачами из переписок.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ConnectionControls
						organizationId={organization.id}
						isConnected={isConnected}
					/>
					{connection && (
						<div className="mt-4 text-sm text-muted-foreground">
							Подключено к{" "}
							<span className="font-medium">{connection.externalOrgName}</span>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
