import { Heading, Section, Text } from "@react-email/components";
import { Button, StandardLayout } from "../components";

interface MemberAddedEmailProps {
	memberName?: string | null;
	organizationName: string;
	role: string;
	addedByName: string;
	dashboardLink?: string;
}

export function MemberAddedEmail({
	memberName = "there",
	organizationName = "Acme Inc",
	role = "member",
	addedByName = "John Smith",
	dashboardLink = "https://app.rox.one",
}: MemberAddedEmailProps) {
	const roleDisplay =
		role === "member"
			? "Участник"
			: role === "admin"
				? "Администратор"
				: "Владелец";

	return (
		<StandardLayout preview={`Вас добавили в ${organizationName}`}>
			<Heading className="text-lg font-normal leading-7 mb-8 text-foreground text-center">
				Теперь вы участник <strong>{organizationName}</strong>
			</Heading>

			<Text className="text-base leading-[26px] mb-4 text-foreground">
				{memberName ? `Здравствуйте, ${memberName}!` : "Здравствуйте!"}
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				{addedByName} добавил вас в <strong>{organizationName}</strong> в Rox в
				роли <strong>{roleDisplay}</strong>.
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				Теперь у вас есть доступ к рабочим пространствам, задачам и процессам
				команды. Перейдите в панель, чтобы начать.
			</Text>

			<Section className="mt-6 mb-6">
				<Button href={dashboardLink}>Перейти в панель</Button>
			</Section>

			<Text className="text-xs leading-5 text-muted">
				Если у вас есть вопросы, обратитесь к {addedByName} или администратору
				команды.
			</Text>
		</StandardLayout>
	);
}

export default MemberAddedEmail;
