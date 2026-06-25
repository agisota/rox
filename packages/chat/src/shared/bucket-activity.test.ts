import { describe, expect, it } from "bun:test";
import {
	type ActivityToolCall,
	bucketActivityToolCalls,
} from "./bucket-activity";

function call(
	id: string,
	name: string,
	over: Partial<ActivityToolCall> = {},
): ActivityToolCall {
	return { id, name, isPending: false, isError: false, ...over };
}

describe("bucketActivityToolCalls", () => {
	it("collapses consecutive same-verb calls into ONE group", () => {
		const groups = bucketActivityToolCalls([
			call("a", "mastra_workspace_read_file"),
			call("b", "mastra_workspace_read_file"),
			call("c", "mastra_workspace_list_files"),
		]);
		expect(groups).toHaveLength(1);
		expect(groups[0].verb).toBe("read");
		expect(groups[0].count).toBe(3);
		expect(groups[0].id).toBe("a");
	});

	it("collapses write/exec runs too", () => {
		const groups = bucketActivityToolCalls([
			call("a", "mastra_workspace_write_file"),
			call("b", "mastra_workspace_edit_file"),
			call("c", "mastra_workspace_execute_command"),
		]);
		expect(groups).toHaveLength(2);
		expect(groups[0].verb).toBe("write");
		expect(groups[0].count).toBe(2);
		expect(groups[1].verb).toBe("shell");
		expect(groups[1].count).toBe(1);
	});

	it("starts a new group when the verb changes", () => {
		const groups = bucketActivityToolCalls([
			call("a", "mastra_workspace_read_file"),
			call("b", "mastra_workspace_search"),
			call("c", "mastra_workspace_read_file"),
		]);
		expect(groups.map((g) => g.verb)).toEqual(["read", "search", "read"]);
	});

	it("is present-tense while any call pends, past once settled", () => {
		const pending = bucketActivityToolCalls([
			call("a", "mastra_workspace_read_file", { isPending: true }),
		]);
		expect(pending[0].tense).toBe("present");
		const settled = bucketActivityToolCalls([
			call("a", "mastra_workspace_read_file"),
		]);
		expect(settled[0].tense).toBe("past");
	});

	it("propagates error state", () => {
		const groups = bucketActivityToolCalls([
			call("a", "mastra_workspace_read_file"),
			call("b", "mastra_workspace_read_file", { isError: true }),
		]);
		expect(groups[0].hasError).toBe(true);
	});

	it("returns an empty list for no calls", () => {
		expect(bucketActivityToolCalls([])).toEqual([]);
	});
});
