import { Heading, Text } from "@react-email/components";
import { Button, StandardLayout } from "../components";

interface WelcomeEmailProps {
	userName?: string;
}

export function WelcomeEmail({ userName = "there" }: WelcomeEmailProps) {
	return (
		<StandardLayout preview="Добро пожаловать в Rox! Давайте начнём.">
			<Heading style={heading}>Добро пожаловать в Rox, {userName}!</Heading>

			<Text style={paragraph}>
				Спасибо, что присоединились к Rox. Мы рады помочь вам автоматизировать
				рабочие процессы и повысить продуктивность с управлением задачами на
				базе ИИ.
			</Text>

			<Text style={paragraph}>Вот что можно сделать дальше:</Text>

			<Text style={listItem}>
				✓ Создайте первое рабочее пространство и пригласите команду
			</Text>
			<Text style={listItem}>
				✓ Подключите любимые инструменты и интеграции
			</Text>
			<Text style={listItem}>
				✓ Настройте первый автоматизированный процесс
			</Text>

			<Button href="https://app.rox.one/onboarding">Начать</Button>

			<Text style={footer}>
				Нужна помощь? Загляните в{" "}
				<a href="https://rox.one/docs" style={link}>
					документацию
				</a>{" "}
				или напишите в{" "}
				<a href="https://rox.one/support" style={link}>
					службу поддержки
				</a>
				.
			</Text>
		</StandardLayout>
	);
}

// Default export for React Email preview
export default WelcomeEmail;

const heading = {
	color: "#000000",
	fontSize: "28px",
	fontWeight: "600" as const,
	lineHeight: "1.3",
	margin: "0 0 24px 0",
};

const paragraph = {
	color: "#515759",
	fontSize: "16px",
	lineHeight: "22px",
	margin: "0 0 16px 0",
};

const listItem = {
	color: "#515759",
	fontSize: "16px",
	lineHeight: "28px",
	margin: "0 0 8px 0",
};

const footer = {
	color: "#77767e",
	fontSize: "14px",
	lineHeight: "22px",
	margin: "24px 0 0 0",
};

const link = {
	color: "#966dd5",
	textDecoration: "none",
};
