"use client";

import { toast } from "@rox/ui/sonner";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

const ERROR_MESSAGES: Record<string, string> = {
	oauth_denied: "Авторизация отклонена. Попробуйте еще раз.",
	missing_params: "Недействительный OAuth-ответ. Попробуйте еще раз.",
	invalid_state: "Недействительный параметр state. Попробуйте еще раз.",
	token_exchange_failed: "Не удалось подключиться к Slack. Попробуйте еще раз.",
	slack_api_error: "Произошла ошибка Slack API. Попробуйте еще раз.",
	unauthorized: "У вас нет прав на это действие.",
};

export function ErrorHandler() {
	const searchParams = useSearchParams();

	useEffect(() => {
		const error = searchParams.get("error");
		if (!error) return;

		const message =
			error === "workspace_already_linked"
				? searchParams.get("owner")
					? `Этот воркспейс Slack уже подключил ${searchParams.get("owner")}. Попросите сначала отключить его.`
					: "Этот воркспейс Slack уже подключен другой организацией Rox."
				: (ERROR_MESSAGES[error] ?? "Что-то пошло не так.");

		window.history.replaceState({}, "", "/integrations/slack");
		const id = setTimeout(() => toast.error(message), 0);
		return () => clearTimeout(id);
	}, [searchParams]);

	return null;
}
