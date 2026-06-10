"use client";

import { toast } from "@rox/ui/sonner";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

const ERROR_MESSAGES: Record<string, string> = {
	oauth_denied: "Авторизация отклонена. Попробуйте еще раз.",
	missing_params: "Некорректный ответ OAuth. Попробуйте еще раз.",
	invalid_state: "Некорректный параметр state. Попробуйте еще раз.",
	token_exchange_failed: "Не удалось подключиться к Slack. Попробуйте еще раз.",
	slack_api_error: "Произошла ошибка Slack API. Попробуйте еще раз.",
	unauthorized: "У вас нет прав на выполнение этого действия.",
};

export function ErrorHandler() {
	const searchParams = useSearchParams();

	useEffect(() => {
		const error = searchParams.get("error");
		if (!error) return;

		const message =
			error === "workspace_already_linked"
				? searchParams.get("owner")
					? `Это рабочее пространство Slack уже подключено пользователем ${searchParams.get("owner")}. Попросите его сначала отключить интеграцию.`
					: "Это рабочее пространство Slack уже подключено другой организацией Rox."
				: (ERROR_MESSAGES[error] ?? "Что-то пошло не так.");

		window.history.replaceState({}, "", "/integrations/slack");
		const id = setTimeout(() => toast.error(message), 0);
		return () => clearTimeout(id);
	}, [searchParams]);

	return null;
}
