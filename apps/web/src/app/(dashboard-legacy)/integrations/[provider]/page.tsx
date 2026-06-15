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
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { FaBookOpen, FaComments } from "react-icons/fa";
import { SiObsidian, SiTelegram } from "react-icons/si";
import { api } from "@/trpc/server";
import {
	ManualIntegrationControls,
	type ManualIntegrationProvider,
} from "../components/ManualIntegrationControls";

interface ManualProviderMeta {
	name: string;
	description: string;
	setupTitle: string;
	setupDescription: string;
	icon: ReactNode;
}

const MANUAL_PROVIDERS: Record<ManualIntegrationProvider, ManualProviderMeta> =
	{
		telegram: {
			name: "Telegram",
			description:
				"Подключите Telegram-бота, чтобы запускать агентов и получать ответы прямо в чатах.",
			setupTitle: "Bot token и чат",
			setupDescription:
				"Создайте бота через BotFather, добавьте его в нужный чат и сохраните токен в Rox.",
			icon: <SiTelegram className="size-10" />,
		},
		obsidian: {
			name: "Obsidian",
			description:
				"Подключите локальный vault через Obsidian Local REST API для синхронизации заметок.",
			setupTitle: "Vault и Local REST API",
			setupDescription:
				"Укажите API key из Obsidian Local REST API и имя vault, которое будет видно в Rox.",
			icon: <SiObsidian className="size-10" />,
		},
		fibery: {
			name: "Fibery",
			description:
				"Подключите Fibery account token, чтобы Rox мог синхронизировать задачи и контекст.",
			setupTitle: "Account и API token",
			setupDescription:
				"Введите API token и subdomain аккаунта, например `acme` для `acme.fibery.io`.",
			icon: <FaBookOpen className="size-10" />,
		},
		lark: {
			name: "Lark",
			description:
				"Подключите Lark (Feishu), чтобы использовать сообщения и документы как рабочий контекст.",
			setupTitle: "Tenant и app secret",
			setupDescription:
				"Сохраните app secret или tenant token и tenant key из консоли Lark.",
			icon: <FaComments className="size-10" />,
		},
	};

function isManualProvider(value: string): value is ManualIntegrationProvider {
	return value in MANUAL_PROVIDERS;
}

async function getConnection(
	trpc: Awaited<ReturnType<typeof api>>,
	provider: ManualIntegrationProvider,
	organizationId: string,
) {
	switch (provider) {
		case "telegram":
			return trpc.integration.telegram.getConnection.query({ organizationId });
		case "obsidian":
			return trpc.integration.obsidian.getConnection.query({ organizationId });
		case "fibery":
			return trpc.integration.fibery.getConnection.query({ organizationId });
		case "lark":
			return trpc.integration.lark.getConnection.query({ organizationId });
	}
}

interface ManualIntegrationPageProps {
	params: Promise<{ provider: string }>;
}

export default async function ManualIntegrationPage({
	params,
}: ManualIntegrationPageProps) {
	const { provider: providerParam } = await params;
	if (!isManualProvider(providerParam)) {
		notFound();
	}

	const provider = providerParam;
	const meta = MANUAL_PROVIDERS[provider];
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

	const connection = await getConnection(trpc, provider, organization.id);
	const isConnected = !!connection;

	return (
		<div className="space-y-8">
			<Link
				href="/integrations"
				className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
			>
				<ArrowLeft className="size-4" />
				Назад к интеграциям
			</Link>

			<div className="flex items-start gap-6">
				<div className="flex size-16 items-center justify-center rounded-xl border bg-card p-3">
					{meta.icon}
				</div>
				<div className="flex-1">
					<div className="flex items-center gap-3">
						<h1 className="text-2xl font-semibold">{meta.name}</h1>
						{isConnected ? (
							<Badge variant="default" className="gap-1">
								<CheckCircle2 className="size-3" />
								Подключено
							</Badge>
						) : (
							<Badge variant="secondary">Не подключено</Badge>
						)}
					</div>
					<p className="mt-1 text-muted-foreground">{meta.description}</p>
				</div>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>{meta.setupTitle}</CardTitle>
					<CardDescription>{meta.setupDescription}</CardDescription>
				</CardHeader>
				<CardContent>
					<ManualIntegrationControls
						organizationId={organization.id}
						provider={provider}
						connection={connection}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
