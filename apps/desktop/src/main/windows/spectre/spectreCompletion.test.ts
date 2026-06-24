import { describe, expect, it } from "bun:test";
import {
	parseSseLine,
	SPECTRE_MODEL_ID,
	streamSpectreCompletion,
} from "./spectreCompletion";

describe("parseSseLine", () => {
	it("extracts the content delta", () => {
		expect(parseSseLine('data: {"choices":[{"delta":{"content":"hi"}}]}')).toBe(
			"hi",
		);
	});

	it("returns __DONE__ on the terminal sentinel", () => {
		expect(parseSseLine("data: [DONE]")).toBe("__DONE__");
	});

	it("returns null for keep-alives, comments and empty deltas", () => {
		expect(parseSseLine(": keep-alive")).toBeNull();
		expect(parseSseLine("")).toBeNull();
		expect(parseSseLine('data: {"choices":[{"delta":{}}]}')).toBeNull();
	});
});

describe("streamSpectreCompletion", () => {
	it("forces xai/grok-4.3 and yields the streamed tokens in order", async () => {
		const sse =
			'data: {"choices":[{"delta":{"content":"Привет"}}]}\n\n' +
			'data: {"choices":[{"delta":{"content":", мир"}}]}\n\n' +
			"data: [DONE]\n\n";
		let sentBody: string | undefined;
		const fetchImpl = (async (_url: string, init?: RequestInit) => {
			sentBody = init?.body as string;
			return new Response(sse, {
				status: 200,
				headers: { "content-type": "text/event-stream" },
			});
		}) as unknown as typeof fetch;

		const tokens: string[] = [];
		for await (const t of streamSpectreCompletion(
			{ prompt: "привет", imagePngBase64: null },
			{ baseUrl: "http://gw", apiKey: "k", fetchImpl },
		)) {
			tokens.push(t);
		}
		expect(tokens.join("")).toBe("Привет, мир");
		expect(JSON.parse(sentBody ?? "{}").model).toBe(SPECTRE_MODEL_ID);
	});

	it("sends a vision image part when a screenshot is attached", async () => {
		let sentBody: string | undefined;
		const fetchImpl = (async (_url: string, init?: RequestInit) => {
			sentBody = init?.body as string;
			return new Response("data: [DONE]\n\n", { status: 200 });
		}) as unknown as typeof fetch;

		const gen = streamSpectreCompletion(
			{ prompt: "что на экране?", imagePngBase64: "QUJD" },
			{ baseUrl: "http://gw", apiKey: "k", fetchImpl },
		);
		await gen.next();
		const content = JSON.parse(sentBody ?? "{}").messages[1].content;
		expect(Array.isArray(content)).toBe(true);
		expect(content[1].type).toBe("image_url");
		expect(content[1].image_url.url).toContain("base64,QUJD");
	});

	it("throws without an API key", async () => {
		await expect(
			streamSpectreCompletion(
				{ prompt: "x", imagePngBase64: null },
				{ baseUrl: "http://gw", apiKey: "" },
			).next(),
		).rejects.toThrow("not configured");
	});
});
