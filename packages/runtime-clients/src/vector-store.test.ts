import { describe, expect, test } from "bun:test";
import { createHttpEmbedder } from "./ai-provider";
import { createQdrantVectorStore } from "./vector-store";

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

describe("runtime HTTP adapters", () => {
	test("creates qdrant collection when it is missing", async () => {
		const calls: Array<{ url: string; init?: RequestInit }> = [];
		const store = createQdrantVectorStore({
			endpoint: "http://qdrant.test/",
			fetchImpl: async (url, init) => {
				calls.push({ url: String(url), init });
				if (
					String(url).endsWith("/collections/rox_entities") &&
					!init?.method
				) {
					return jsonResponse({}, 404);
				}
				return jsonResponse({ result: true });
			},
		});

		await store.ensureCollection("rox_entities", 384);

		expect(calls).toHaveLength(2);
		expect(calls[1]?.init?.method).toBe("PUT");
		expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
			vectors: { size: 384, distance: "Cosine" },
		});
	});

	test("maps qdrant search hits", async () => {
		const store = createQdrantVectorStore({
			endpoint: "http://qdrant.test",
			fetchImpl: async () =>
				jsonResponse({
					result: [{ id: 123, score: 0.9, payload: { kind: "note" } }],
				}),
		});

		await expect(
			store.search(
				"rox_entities",
				[0.1, 0.2],
				{ must: [{ key: "orgId", match: { value: "org_1" } }] },
				10,
			),
		).resolves.toEqual([{ id: "123", score: 0.9, payload: { kind: "note" } }]);
	});

	test("posts text batches to the local embedder", async () => {
		const provider = createHttpEmbedder({
			endpoint: "http://embedder.test/",
			fetchImpl: async (url, init) => {
				expect(String(url)).toBe("http://embedder.test/embed");
				expect(JSON.parse(String(init?.body))).toEqual({ texts: ["a", "b"] });
				return jsonResponse({ embeddings: [[1], [2]] });
			},
		});

		await expect(provider.embed(["a", "b"])).resolves.toEqual([[1], [2]]);
	});
});
