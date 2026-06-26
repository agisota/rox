import { describe, expect, it } from "bun:test";
import { toSendFailureMessage } from "./sendMessage";

describe("toSendFailureMessage", () => {
	it("maps auth failures when status is 401/403", () => {
		expect(toSendFailureMessage({ status: 401 })).toBe(
			"Ошибка аутентификации модели. Переподключите OAuth или укажите API-ключ в пикере моделей и повторите.",
		);
		expect(toSendFailureMessage({ response: { status: 403 } })).toBe(
			"Ошибка аутентификации модели. Переподключите OAuth или укажите API-ключ в пикере моделей и повторите.",
		);
	});

	it("keeps backend message when status is not auth-related", () => {
		expect(
			toSendFailureMessage(
				new Error("Unauthorized model provider token, please reconnect OAuth"),
			),
		).toBe("Unauthorized model provider token, please reconnect OAuth");
	});
});
