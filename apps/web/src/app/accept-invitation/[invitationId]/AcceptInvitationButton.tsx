"use client";

import { Button } from "@rox/ui/button";
import { useState } from "react";
import { env } from "@/env";

interface AcceptInvitationButtonProps {
	invitationId: string;
	token: string;
}

export function AcceptInvitationButton({
	invitationId,
	token,
}: AcceptInvitationButtonProps) {
	const [isProcessing, setIsProcessing] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const translateInvitationError = (message: string) => {
		switch (message) {
			case "This invitation has already been accepted.":
				return "Это приглашение уже принято.";
			case "This invitation link is invalid or has expired.":
				return "Ссылка приглашения недействительна или срок ее действия истек.";
			case "This invitation is no longer available.":
				return "Это приглашение больше недоступно.";
			case "Failed to accept invitation":
			case "Failed to accept invitation.":
				return "Не удалось принять приглашение.";
			default:
				return message;
		}
	};

	const getErrorMessage = async (response: Response) => {
		const text = await response.text();

		if (text) {
			try {
				const data = JSON.parse(text) as {
					error?: string;
					message?: string;
				};

				if (data.error) return translateInvitationError(data.error);
				if (data.message) return translateInvitationError(data.message);
			} catch {
				return translateInvitationError(text);
			}
		}

		if (response.status === 409) {
			return "Это приглашение уже принято.";
		}

		if (response.status === 400 || response.status === 404) {
			return "Ссылка приглашения недействительна или срок ее действия истек.";
		}

		return "Не удалось принять приглашение.";
	};

	const handleContinue = async () => {
		setIsProcessing(true);
		setError(null);
		try {
			// Call the Better Auth endpoint that handles auth and cookies properly
			const response = await fetch(
				`${env.NEXT_PUBLIC_API_URL}/api/auth/accept-invitation`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					credentials: "include",
					body: JSON.stringify({
						invitationId,
						token,
					}),
				},
			);

			if (!response.ok) {
				throw new Error(await getErrorMessage(response));
			}

			// Session cookie is now set by the server
			// Force a hard redirect to reload the session
			window.location.href = "/";
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Не удалось принять приглашение.",
			);
			setIsProcessing(false);
		}
	};

	return (
		<>
			<Button onClick={handleContinue} size="lg" disabled={isProcessing}>
				{isProcessing ? "Обработка..." : "Принять приглашение"}
			</Button>

			{error && <p className="text-sm text-destructive">{error}</p>}
		</>
	);
}
