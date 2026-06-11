"use client";

import { toast } from "@rox/ui/sonner";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

const ERROR_MESSAGES: Record<string, string> = {
	oauth_denied: "Авторизация отклонена. Попробуйте еще раз.",
	missing_params: "Некорректный ответ OAuth. Попробуйте еще раз.",
	invalid_state: "Некорректный параметр state. Попробуйте еще раз.",
	token_exchange_failed:
		"Не удалось подключиться к Linear. Попробуйте еще раз.",
};

export function ErrorHandler() {
	const searchParams = useSearchParams();

	useEffect(() => {
		const error = searchParams.get("error");
		if (!error) return;

		const message = ERROR_MESSAGES[error] ?? "Что-то пошло не так.";

		window.history.replaceState({}, "", "/integrations/linear");
		const id = setTimeout(() => toast.error(message), 0);
		return () => clearTimeout(id);
	}, [searchParams]);

	return null;
}
