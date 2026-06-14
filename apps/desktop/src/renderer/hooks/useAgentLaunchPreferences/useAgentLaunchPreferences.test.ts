import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: test reads source for a regression guard
import { readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: test reads source for a regression guard
import { join } from "node:path";

// Regression guard for the "+ New Workspace" crash ("Maximum update depth
// exceeded"). The valid-agents Set must be memoized on its CONTENTS, not on the
// `validAgents` array identity: several callers build `validAgents` as a fresh
// `["none", ...ids]` literal every render, so depending on the array identity
// rebuilt the Set — and re-ran the corrective effect below — on every render,
// flipping a controlled radix <Select> value undefined↔string into an infinite
// update loop. See PromptGroup.tsx / DashboardNewWorkspaceForm / OpenInWorkspace
// / RunInWorkspacePopover, which all pass that fresh literal.
describe("useAgentLaunchPreferences agent-set memo stability", () => {
	const source = readFileSync(
		join(import.meta.dir, "useAgentLaunchPreferences.ts"),
		"utf8",
	);

	test("validAgentSet is NOT keyed on the validAgents array identity", () => {
		// The buggy form depended directly on the array prop identity.
		expect(source).not.toContain("new Set(validAgents), [validAgents]");
	});

	test("validAgentSet is keyed on the joined contents", () => {
		expect(source).toContain("validAgentsKey");
		expect(source).toMatch(/new Set\(validAgents\),\s*\[validAgentsKey\]/);
	});
});
