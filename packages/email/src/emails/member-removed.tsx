import { Heading, Text } from "@react-email/components";
import { StandardLayout } from "../components";

interface MemberRemovedEmailProps {
	memberName?: string | null;
	organizationName: string;
	removedByName: string;
}

export function MemberRemovedEmail({
	memberName = "there",
	organizationName = "Acme Inc",
	removedByName = "John Smith",
}: MemberRemovedEmailProps) {
	return (
		<StandardLayout preview={`Вас удалили из ${organizationName}`}>
			<Heading className="text-lg font-normal leading-7 mb-8 text-foreground text-center">
				Вас удалили из <strong>{organizationName}</strong>
			</Heading>

			<Text className="text-base leading-[26px] mb-4 text-foreground">
				{memberName ? `Здравствуйте, ${memberName}!` : "Здравствуйте!"}
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				{removedByName} удалил вас из <strong>{organizationName}</strong> в Rox.
			</Text>

			<Text className="text-base leading-[26px] text-foreground mb-4">
				У вас больше нет доступа к рабочим пространствам, задачам и процессам
				этой организации.
			</Text>

			<Text className="text-xs leading-5 text-muted">
				Если вы считаете, что это ошибка, свяжитесь с {removedByName} или
				администратором команды.
			</Text>
		</StandardLayout>
	);
}

export default MemberRemovedEmail;
