import { describe, expect, it } from "bun:test";
import {
	buildAgentFileCommand,
	buildAgentPromptCommand,
} from "./agent-command";

describe("buildAgentPromptCommand", () => {
	it("defaults prompt launches to OMP", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "omp-1234",
		});

		expect(command).toStartWith(
			"omp --auto-approve -p \"$(cat <<'ROX_PROMPT_omp1234'",
		);
	});

	it("adds `--` before codex prompt payload", () => {
		const command = buildAgentPromptCommand({
			prompt: "- Only modified file: runtime.ts",
			randomId: "1234-5678",
			agent: "codex",
		});

		expect(command).toContain(
			"codex --dangerously-bypass-approvals-and-sandbox -- \"$(cat <<'ROX_PROMPT_12345678'",
		);
		expect(command).toContain("- Only modified file: runtime.ts");
	});

	it("does not change non-codex commands", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "abcd-efgh",
			agent: "claude",
		});

		expect(command).toStartWith(
			"claude --dangerously-skip-permissions \"$(cat <<'ROX_PROMPT_abcdefgh'",
		);
	});

	it("uses Amp interactive stdin mode for prompt launches", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "amp-1234",
			agent: "amp",
		});

		expect(command).toStartWith("amp <<'ROX_PROMPT_amp1234'");
		expect(command).not.toContain("amp -x");
	});

	it("uses Amp interactive stdin mode for file launches", () => {
		const command = buildAgentFileCommand({
			filePath: ".rox/task-demo.md",
			agent: "amp",
		});

		expect(command).toBe("amp < '.rox/task-demo.md'");
	});

	it("uses pi interactive mode for prompt launches", () => {
		const command = buildAgentPromptCommand({
			prompt: "hello",
			randomId: "pi-1234",
			agent: "pi",
		});

		expect(command).toStartWith("pi \"$(cat <<'ROX_PROMPT_pi1234'");
		expect(command).not.toContain("pi -p");
	});
});
