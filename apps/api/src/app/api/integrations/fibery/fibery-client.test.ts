import { describe, expect, it, mock } from "bun:test";
import { type FiberyCommand, runCommands } from "./fibery-client";

const COMMANDS: FiberyCommand[] = [
	{ command: "fibery.entity/query", args: { from: "Task" } },
];

function jsonResponse(body: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { "Content-Type": "application/json" },
		...init,
	});
}

describe("runCommands", () => {
	it("POSTs to the account command URL with the auth header and JSON body", async () => {
		const fetchImpl = mock(async () =>
			jsonResponse([{ success: true, result: [] }]),
		);

		await runCommands({
			account: "acme",
			token: "secret-token",
			commands: COMMANDS,
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});

		expect(fetchImpl).toHaveBeenCalledTimes(1);
		const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://acme.fibery.io/api/commands");
		expect(init.method).toBe("POST");
		const headers = init.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Token secret-token");
		expect(headers["Content-Type"]).toBe("application/json");
		expect(init.body).toBe(JSON.stringify(COMMANDS));
	});

	it("returns the parsed result array", async () => {
		const payload = [
			{ success: true, result: [{ "fibery/id": "abc", name: "Hello" }] },
		];
		const fetchImpl = mock(async () => jsonResponse(payload));

		const result = await runCommands({
			account: "acme",
			token: "t",
			commands: COMMANDS,
			fetchImpl: fetchImpl as unknown as typeof fetch,
		});

		expect(result).toEqual(payload);
	});

	it("throws a clear error when the response is not ok", async () => {
		const fetchImpl = mock(async () =>
			jsonResponse({ message: "nope" }, { status: 401 }),
		);

		await expect(
			runCommands({
				account: "acme",
				token: "bad",
				commands: COMMANDS,
				fetchImpl: fetchImpl as unknown as typeof fetch,
			}),
		).rejects.toThrow(/401/);
	});

	it("throws a clear error when the transport rejects", async () => {
		const fetchImpl = mock(async () => {
			throw new Error("network down");
		});

		await expect(
			runCommands({
				account: "acme",
				token: "t",
				commands: COMMANDS,
				fetchImpl: fetchImpl as unknown as typeof fetch,
			}),
		).rejects.toThrow(/network down/);
	});
});
