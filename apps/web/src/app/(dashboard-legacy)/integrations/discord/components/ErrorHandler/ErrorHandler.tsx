"use client";

import { toast } from "@rox/ui/sonner";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

const ERROR_MESSAGES: Record<string, string> = {
	oauth_denied: "Authorization was denied. Please try again.",
	missing_params: "Invalid OAuth response. Please try again.",
	invalid_state: "Invalid state parameter. Please try again.",
	unauthorized: "You are not authorized to perform this action.",
	not_configured: "Discord is not configured. Contact your administrator.",
	token_exchange_failed: "Failed to connect to Discord. Please try again.",
};

export function ErrorHandler() {
	const searchParams = useSearchParams();

	useEffect(() => {
		const error = searchParams.get("error");
		if (!error) return;

		const message = ERROR_MESSAGES[error] ?? "Something went wrong.";

		window.history.replaceState({}, "", "/integrations/discord");
		const id = setTimeout(() => toast.error(message), 0);
		return () => clearTimeout(id);
	}, [searchParams]);

	return null;
}
