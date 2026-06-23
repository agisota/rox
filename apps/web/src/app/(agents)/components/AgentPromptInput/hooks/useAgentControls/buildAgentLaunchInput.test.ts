import { describe, expect, it } from "bun:test";
import { buildAgentLaunchInput } from "./buildAgentLaunchInput";
import type { AgentSourceOption } from "./types";

const source: AgentSourceOption = {
	id: "src-1",
	name: "Acme MCP",
	slug: "acme-mcp",
	kind: "mcp",
	status: "active",
};

describe("buildAgentLaunchInput — run-wiring seam (composer side)", () => {
	it("threads the selected source id onto the launch input as sourceId", () => {
		const input = buildAgentLaunchInput({
			workspaceId: "ws-1",
			agent: "rox",
			prompt: "do the thing",
			selectedSource: source,
		});

		expect(input).toEqual({
			workspaceId: "ws-1",
			agent: "rox",
			prompt: "do the thing",
			sourceId: "src-1",
		});
	});

	it("omits sourceId entirely when no source is selected (sourceless launch unchanged)", () => {
		const input = buildAgentLaunchInput({
			workspaceId: "ws-1",
			agent: "rox",
			prompt: "do the thing",
			selectedSource: null,
		});

		expect(input).toEqual({
			workspaceId: "ws-1",
			agent: "rox",
			prompt: "do the thing",
		});
		expect(input).not.toHaveProperty("sourceId");
	});
});
