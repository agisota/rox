import { describe, expect, test } from "bun:test";
import { createTaskWith } from "./createTaskWith";

describe("createTaskWith", () => {
	test("calls mutate with the built payload", async () => {
		const calls: unknown[] = [];
		const mutate = async (input: unknown) => {
			calls.push(input);
		};

		const dispatched = await createTaskWith(mutate, {
			title: "  New task  ",
			priority: "high",
		});

		expect(dispatched).toBe(true);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toEqual({ title: "New task", priority: "high" });
	});

	test("does not call mutate for an empty title", async () => {
		const calls: unknown[] = [];
		const mutate = async (input: unknown) => {
			calls.push(input);
		};

		const dispatched = await createTaskWith(mutate, { title: "   " });

		expect(dispatched).toBe(false);
		expect(calls).toHaveLength(0);
	});
});
