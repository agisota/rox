import { Badge } from "@rox/ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@rox/ui/card";
import { AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { SiLinear } from "react-icons/si";
import { api } from "@/trpc/server";
import { ConnectionControls } from "./components/ConnectionControls";
import { ErrorHandler } from "./components/ErrorHandler";
import { TeamSelector } from "./components/TeamSelector";

export default async function LinearIntegrationPage() {
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

	const connection = await trpc.integration.linear.getConnection.query({
		organizationId: organization.id,
	});
	const isConnected = !!connection;
	const needsReconnect = !!connection?.needsReconnect;

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
					<SiLinear className="size-10" />
				</div>
				<div className="flex-1">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-semibold">Linear</h1>
						{needsReconnect ? (
							<Badge variant="destructive" className="gap-1">
								<AlertTriangle className="size-3" />
								Нужно переподключить
							</Badge>
						) : isConnected ? (
							<Badge variant="default" className="gap-1">
								<CheckCircle2 className="size-3" />
								Подключено
							</Badge>
						) : (
							<Badge variant="secondary">Не подключено</Badge>
						)}
					</div>
					<p className="mt-1 text-muted-foreground">
						Двусторонняя синхронизация задач с Linear. Создавайте задачи в Rox,
						чтобы они появлялись в Linear, или импортируйте существующие задачи
						Linear.
					</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>Подключение</CardTitle>
					<CardDescription>
						Подключите рабочее пространство Linear для двусторонней
						синхронизации задач.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<ConnectionControls
						organizationId={organization.id}
						isConnected={isConnected}
						needsReconnect={needsReconnect}
					/>
				</CardContent>
			</Card>

			{connection && (
				<Card>
					<CardHeader>
						<CardTitle>Настройки</CardTitle>
						<CardDescription>
							Настройте синхронизацию задач между Rox и Linear.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<p className="text-sm font-medium">
								Команда по умолчанию для новых задач
							</p>
							<TeamSelector organizationId={organization.id} />
							<p className="text-sm text-muted-foreground">
								Задачи, созданные в Rox, будут синхронизироваться с этой
								командой Linear.
							</p>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
