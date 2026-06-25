import { describe, expect, test } from "bun:test";
import type { BlockHandlerContext } from "../executor/types";
import { type EmbedPort, makeEmbeddingHandler } from "./embeddingHandler";

function ctx(
	subBlocks: Record<string, unknown>,
	input: Record<string, unknown> = {},
): BlockHandlerContext {
	return {
		blockId: "e1",
		block: { type: "embedding", subBlocks },
		input,
		runInput: input,
		resolveSecret: () => undefined,
	};
}

const DIMS = 8;
const fakeEmbed: EmbedPort = async (req) => ({
	// Deterministic fixed-dimension vector derived from the text length.
	embedding: Array.from({ length: DIMS }, (_, i) => req.text.length + i),
	usage: { tokens: 3 },
});

describe("makeEmbeddingHandler", () => {
	test("returns a fixed-dimension vector on the out handle", async () => {
		const handler = makeEmbeddingHandler(fakeEmbed);
		const res = await handler(ctx({ text: "hello world" }));
		expect(res.handle).toBe("out");
		expect(res.output?.embedding).toHaveLength(DIMS);
		expect(res.output?.dimensions).toBe(DIMS);
		expect(res.error).toBeUndefined();
	});

	test("falls back to upstream input text", async () => {
		let seen = "";
		const handler = makeEmbeddingHandler(async (req) => {
			seen = req.text;
			return { embedding: [0, 1] };
		});
		const res = await handler(ctx({}, { text: "from upstream" }));
		expect(res.handle).toBe("out");
		expect(seen).toBe("from upstream");
	});

	test("missing text routes to error handle (not silent)", async () => {
		const handler = makeEmbeddingHandler(fakeEmbed);
		const res = await handler(ctx({}));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("EMBEDDING_TEXT_MISSING");
		expect(res.output).toBeUndefined();
	});

	test("provider error (e.g. unconfigured) routes to error handle", async () => {
		const handler = makeEmbeddingHandler(async () => {
			throw new Error("No embedding credentials available");
		});
		const res = await handler(ctx({ text: "hi" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("EMBEDDING_FAILED");
		expect(res.error?.message).toContain("credentials");
	});
});
