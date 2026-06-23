import { describe, expect, mock, test } from "bun:test";
import { editOriginalInteractionResponse } from "./discord-client";

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

describe("editOriginalInteractionResponse", () => {
	test("PATCHes the @original webhook message with the content", async () => {
		const fetchImpl = mock(async () => jsonResponse(200, { id: "msg-1" }));

		await editOriginalInteractionResponse({
			applicationId: "app-1",
			interactionToken: "tok-1",
			content: "hello",
			fetchImpl,
		});

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
		expect(url).toBe(
			"https://discord.com/api/v10/webhooks/app-1/tok-1/messages/@original",
		);
		expect(init.method).toBe("PATCH");
		expect(init.body).toBe(JSON.stringify({ content: "hello" }));
		expect((init.headers as Record<string, string>)["content-type"]).toBe(
			"application/json",
		);
	});

	test("does not send a bot Authorization header (token authenticates)", async () => {
		const fetchImpl = mock(async () => jsonResponse(200, { id: "msg-1" }));

		await editOriginalInteractionResponse({
			applicationId: "app-1",
			interactionToken: "tok-1",
			content: "hi",
			fetchImpl,
		});

		const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
		const headers = init.headers as Record<string, string>;
		expect(headers.Authorization).toBeUndefined();
		expect(headers.authorization).toBeUndefined();
	});

	test("throws a clear error when Discord responds non-2xx", async () => {
		const fetchImpl = mock(async () =>
			jsonResponse(401, { message: "Invalid Webhook Token", code: 50027 }),
		);

		await expect(
			editOriginalInteractionResponse({
				applicationId: "app-1",
				interactionToken: "expired",
				content: "late",
				fetchImpl,
			}),
		).rejects.toThrow(/Discord edit original response failed/);
	});

	test("throws when the transport itself fails", async () => {
		const fetchImpl = mock(async () => {
			throw new Error("network down");
		});

		await expect(
			editOriginalInteractionResponse({
				applicationId: "app-1",
				interactionToken: "tok-1",
				content: "hi",
				fetchImpl,
			}),
		).rejects.toThrow(/Discord edit original response request failed/);
	});
});
