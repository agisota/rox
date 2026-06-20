import { Heading, Link, Section, Text } from "@react-email/components";
import { differenceInDays } from "date-fns";
import { Button, StandardLayout } from "../components";

interface OrganizationInvitationEmailProps {
	organizationName: string;
	inviterName: string;
	inviteLink: string;
	role: string;
	inviteeName?: string | null;
	inviterEmail: string;
	expiresAt: Date;
}

export function OrganizationInvitationEmail({
	organizationName = "Acme Inc",
	inviterName = "John Smith",
	inviteLink = "https://app.rox.one/accept-invitation/123?token=abc",
	role = "member",
	inviteeName = "Satya Patel",
	inviterEmail = "john@acme.com",
	expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
}: OrganizationInvitationEmailProps) {
	const roleDisplay = role === "member" ? "Участник" : "Администратор";

	// Calculate days until expiration
	const daysUntilExpiration = differenceInDays(expiresAt, new Date());
	const expirationText =
		daysUntilExpiration === 1 ? "1 день" : `${daysUntilExpiration} дн.`;

	return (
		<StandardLayout
			preview={`${inviterName} приглашает вас в ${organizationName}`}
		>
			<Heading className="text-lg font-normal leading-7 mb-8 text-foreground text-center">
				Присоединяйтесь к <strong>{organizationName}</strong> в{" "}
				<strong>Rox</strong>
			</Heading>

			{inviteeName && (
				<Text className="text-base leading-[26px] mb-4 text-foreground">
					Здравствуйте, {inviteeName}!
				</Text>
			)}

			<Text className="text-base leading-[26px] text-foreground mb-4">
				{inviterName} ({inviterEmail}) приглашает вас присоединиться к{" "}
				<strong>{organizationName}</strong> в Rox в роли{" "}
				<strong>{roleDisplay}</strong>.
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				Rox помогает командам автоматизировать процессы, управлять задачами и
				эффективно работать вместе. Примите приглашение, чтобы начать.
			</Text>

			<Section className="mt-6 mb-6">
				<Button href={inviteLink}>Принять приглашение</Button>
			</Section>

			<Text className="text-xs leading-5 text-muted mt-4 mb-2">
				Или скопируйте и вставьте эту ссылку в браузер:
			</Text>
			<Link
				href={inviteLink}
				className="text-sm leading-6 text-primary break-all block mb-6 no-underline"
			>
				{inviteLink}
			</Link>

			<Text className="text-xs leading-5 text-muted">
				Приглашение истекает через {expirationText}. Если вы не ожидали это
				приглашение, можно просто проигнорировать это письмо.
			</Text>
		</StandardLayout>
	);
}

export default OrganizationInvitationEmail;
