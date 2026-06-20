import {
	Body,
	Container,
	Head,
	Heading,
	Hr,
	Html,
	Preview,
	Text,
} from "@react-email/components";

interface EnterpriseInquiryEmailProps {
	name: string;
	role: string;
	company: string;
	email: string;
	phone?: string;
	message?: string;
}

export function EnterpriseInquiryEmail({
	name = "Jane Doe",
	role = "Engineering Lead",
	company = "Acme Inc.",
	email = "jane@example.com",
	phone = "",
	message = "",
}: EnterpriseInquiryEmailProps) {
	return (
		<Html>
			<Head />
			<Preview>
				Запрос Enterprise от {name} ({email})
			</Preview>
			<Body style={body}>
				<Container style={container}>
					<Heading style={heading}>Новый запрос Enterprise</Heading>

					<Text style={paragraph}>
						С маркетингового сайта поступил новый запрос Enterprise.
					</Text>

					<Hr style={hr} />

					<Text style={label}>Имя</Text>
					<Text style={value}>{name}</Text>

					<Text style={label}>Роль</Text>
					<Text style={value}>{role}</Text>

					<Text style={label}>Компания</Text>
					<Text style={value}>{company}</Text>

					<Text style={label}>Email</Text>
					<Text style={value}>{email}</Text>

					{phone && (
						<>
							<Text style={label}>Телефон</Text>
							<Text style={value}>{phone}</Text>
						</>
					)}

					{message && (
						<>
							<Text style={label}>Какую задачу они хотят решить?</Text>
							<Text style={value}>{message}</Text>
						</>
					)}
				</Container>
			</Body>
		</Html>
	);
}

// Default export for React Email preview
export default EnterpriseInquiryEmail;

const body = {
	backgroundColor: "#ffffff",
	fontFamily:
		'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

const container = {
	margin: "0 auto",
	padding: "40px 24px",
	maxWidth: "560px",
};

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

const hr = {
	borderColor: "#EBEBEB",
	margin: "24px 0",
};

const label = {
	color: "#77767e",
	fontSize: "12px",
	fontWeight: "600" as const,
	textTransform: "uppercase" as const,
	letterSpacing: "0.05em",
	lineHeight: "16px",
	margin: "16px 0 4px 0",
};

const value = {
	color: "#242424",
	fontSize: "16px",
	lineHeight: "22px",
	margin: "0 0 0 0",
};
