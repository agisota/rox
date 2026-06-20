import { Heading, Section, Text } from "@react-email/components";
import { Button, StandardLayout } from "../components";

export interface DisconnectedConnection {
	orgName: string;
	workspaceName: string;
	provider: "Linear" | "Slack";
	winnerEmail: string;
}

interface IntegrationDisconnectedEmailProps {
	recipientName?: string | null;
	connections?: DisconnectedConnection[];
}

const PLACEHOLDER_CONNECTIONS: DisconnectedConnection[] = [
	{
		orgName: "Acme Inc",
		workspaceName: "Acme",
		provider: "Linear",
		winnerEmail: "owner@acme.com",
	},
];

export function IntegrationDisconnectedEmail({
	recipientName,
	connections = PLACEHOLDER_CONNECTIONS,
}: IntegrationDisconnectedEmailProps) {
	const isSingle = connections.length === 1;
	const first = connections[0];

	return (
		<StandardLayout preview="Интеграция Rox была отключена">
			<Heading className="text-lg font-normal leading-7 mb-8 text-foreground text-center">
				Интеграция Rox была отключена
			</Heading>

			<Text className="text-base leading-[26px] mb-4 text-foreground">
				{recipientName ? `Здравствуйте, ${recipientName}!` : "Здравствуйте!"}
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				Мы обнаружили, что несколько организаций Rox были подключены к одному и
				тому же {isSingle ? first?.provider : "внешнему"} рабочему пространству,
				из-за чего синхронизация вебхуков маршрутизировалась между ними
				недетерминированно. Чтобы это исправить, мы оставили подключение
				наиболее недавно активной организации, а остальные отключили.
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				{connections.length > 1
					? "Следующие подключения были отключены:"
					: "Следующее подключение было отключено:"}
			</Text>

			<Section className="mb-6">
				{connections.map((c) => (
					<Text
						key={`${c.orgName}-${c.provider}-${c.workspaceName}`}
						className="text-base leading-[26px] text-foreground mb-2"
					>
						• <strong>{c.orgName}</strong> → рабочее пространство {c.provider}{" "}
						<strong>{c.workspaceName}</strong> — теперь принадлежит{" "}
						<a href={`mailto:${c.winnerEmail}`}>{c.winnerEmail}</a>
					</Text>
				))}
			</Section>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				Если подключённой должна быть именно ваша организация, попросите
				указанного владельца сначала отключиться на своей странице интеграций
				Rox, а затем подключитесь со своей.
			</Text>

			<Section className="mt-6 mb-6">
				<Button href="https://app.rox.one/integrations">
					Открыть интеграции
				</Button>
			</Section>

			<Text className="text-xs leading-5 text-muted">
				Ответьте на это письмо, если есть вопросы.
			</Text>
		</StandardLayout>
	);
}

export default IntegrationDisconnectedEmail;
