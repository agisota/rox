import { Heading, Text } from "@react-email/components";
import { Button, StandardLayout } from "../components";

interface VerifyEmailProps {
	userName?: string;
	verificationUrl?: string;
}

export function VerifyEmail({
	userName = "there",
	verificationUrl = "https://app.rox.one/api/auth/verify-email?token=example",
}: VerifyEmailProps) {
	return (
		<StandardLayout preview="Verify your email to finish setting up your Rox account">
			<Heading style={heading}>Verify your email</Heading>

			<Text style={paragraph}>Hi {userName},</Text>

			<Text style={paragraph}>
				Thanks for signing up for Rox. Confirm this email address to activate
				your account and start automating your workflows.
			</Text>

			<Button href={verificationUrl}>Verify email address</Button>

			<Text style={footer}>
				This link expires in 24 hours. If you didn't create a Rox account, you
				can safely ignore this email.
			</Text>
		</StandardLayout>
	);
}

// Default export for React Email preview
export default VerifyEmail;

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

const footer = {
	color: "#77767e",
	fontSize: "14px",
	lineHeight: "22px",
	margin: "24px 0 0 0",
};
