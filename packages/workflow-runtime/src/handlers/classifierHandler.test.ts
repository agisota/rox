import { describe, expect, test } from "bun:test";
import type { BlockHandlerContext } from "../executor/types";
import {
	type ClassifyPort,
	labelToHandle,
	makeClassifierHandler,
	parseLabels,
} from "./classifierHandler";

function ctx(
	subBlocks: Record<string, unknown>,
	input: Record<string, unknown> = {},
): BlockHandlerContext {
	return {
		blockId: "c1",
		block: { type: "classifier", subBlocks },
		input,
		runInput: input,
		resolveSecret: () => undefined,
	};
}

describe("parseLabels", () => {
	test("accepts strings and {label}/{value} objects, de-dupes + trims", () => {
		expect(
			parseLabels([" spam ", { label: "ham" }, { value: "spam" }, ""]),
		).toEqual(["spam", "ham"]);
	});

	test("non-array yields empty", () => {
		expect(parseLabels("nope")).toEqual([]);
	});
});

describe("labelToHandle", () => {
	test("slugifies into a class handle", () => {
		expect(labelToHandle("Customer Support")).toBe("class:customer_support");
	});
});

describe("makeClassifierHandler", () => {
	// Fake LLM port: returns the first label whose text appears in the input.
	const fakeClassify: ClassifyPort = async (req) => {
		const hit = req.labels.find((l) =>
			req.text.toLowerCase().includes(l.toLowerCase()),
		);
		return { label: hit ?? req.labels[0] ?? "", score: hit ? 0.95 : 0.1 };
	};

	test("picks the label and fires the per-class handle", async () => {
		const handler = makeClassifierHandler(fakeClassify);
		const res = await handler(
			ctx({ labels: ["spam", "ham"], text: "this is HAM" }),
		);
		expect(res.handle).toBe("class:ham");
		expect(res.output?.label).toBe("ham");
		expect(res.output?.score).toBe(0.95);
		expect(res.error).toBeUndefined();
	});

	test("forwards text + labels to the port", async () => {
		let seen: { text: string; labels: string[] } | undefined;
		const handler = makeClassifierHandler(async (req) => {
			seen = { text: req.text, labels: req.labels };
			return { label: req.labels[0] ?? "" };
		});
		await handler(ctx({ labels: ["a", "b"] }, { text: "upstream text" }));
		expect(seen).toEqual({ text: "upstream text", labels: ["a", "b"] });
	});

	test("missing labels routes to error", async () => {
		const handler = makeClassifierHandler(fakeClassify);
		const res = await handler(ctx({ text: "hi" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("CLASSIFIER_LABELS_MISSING");
	});

	test("missing text routes to error", async () => {
		const handler = makeClassifierHandler(fakeClassify);
		const res = await handler(ctx({ labels: ["a", "b"] }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("CLASSIFIER_TEXT_MISSING");
	});

	test("out-of-set label from provider routes to error", async () => {
		const handler = makeClassifierHandler(async () => ({ label: "other" }));
		const res = await handler(ctx({ labels: ["a", "b"], text: "x" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("CLASSIFIER_LABEL_OUT_OF_SET");
	});

	test("provider error routes to error", async () => {
		const handler = makeClassifierHandler(async () => {
			throw new Error("llm down");
		});
		const res = await handler(ctx({ labels: ["a"], text: "x" }));
		expect(res.handle).toBe("error");
		expect(res.error?.code).toBe("CLASSIFIER_CALL_FAILED");
		expect(res.error?.message).toContain("llm down");
	});
});
