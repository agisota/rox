"use client";

import { toast } from "@rox/ui/sonner";
import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

const ERROR_MESSAGES: Record<string, string> = {
	installation_cancelled: "Установка GitHub App отменена.",
	missing_params: "Некорректный ответ установки. Попробуйте еще раз.",
	invalid_state: "Некорректный параметр state. Попробуйте еще раз.",
	installation_fetch_failed:
		"Не удалось получить сведения об установке. Попробуйте еще раз.",
	save_failed: "Не удалось сохранить установку. Попробуйте еще раз.",
	already_connected:
		"Эта установка GitHub уже подключена к другой организации Rox. Отключите ее там или удалите Rox GitHub App, а затем попробуйте снова.",
	unexpected: "Что-то пошло не так. Попробуйте еще раз.",
};

const WARNING_MESSAGES: Record<string, string> = {
	sync_queue_failed:
		"GitHub подключен, но начальную синхронизацию не удалось запустить. Попробуйте подключить его снова.",
};

const SUCCESS_MESSAGES: Record<string, string> = {
	github_installed: "GitHub App успешно установлен!",
};

export function ErrorHandler() {
	const searchParams = useSearchParams();

	useEffect(() => {
		const error = searchParams.get("error");
		const warning = searchParams.get("warning");
		const success = searchParams.get("success");

		if (error) {
			toast.error(ERROR_MESSAGES[error] ?? "Что-то пошло не так.");
			window.history.replaceState({}, "", "/integrations/github");
		} else if (warning) {
			toast.warning(WARNING_MESSAGES[warning] ?? "Возникло предупреждение.");
			window.history.replaceState({}, "", "/integrations/github");
		} else if (success) {
			toast.success(SUCCESS_MESSAGES[success] ?? "Готово!");
			window.history.replaceState({}, "", "/integrations/github");
		}
	}, [searchParams]);

	return null;
}
