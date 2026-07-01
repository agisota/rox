import type { FusionNode, FusionProject } from "./fusionTypes";
import { fusionNodeSchema, fusionProjectSchema } from "./fusionTypes";

export interface FusionCliCommand {
	command: "fn";
	args: string[];
}

export interface FusionTaskCreateInput {
	description: string;
	node?: string;
	project?: string;
	dependencies?: string[];
	attachments?: string[];
	noDedup?: boolean;
}

export interface FusionTaskCreateResult {
	taskId: string;
	column?: string;
	path?: string;
	linkedExisting: boolean;
	rawOutput: string;
}

export interface FusionCliRunResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	timedOut: boolean;
}

export interface FusionCliRunOptions {
	cwd?: string;
	env?: Record<string, string | undefined>;
	command?: "fn";
	timeoutMs?: number;
}

export function buildFusionTaskCreateCommand(
	input: FusionTaskCreateInput,
): FusionCliCommand {
	const args: string[] = [];
	if (input.project) args.push("--project", input.project);
	args.push("task", "create", input.description);
	if (input.noDedup ?? true) args.push("--no-dedup");
	if (input.node) args.push("--node", input.node);
	for (const dependency of input.dependencies ?? []) {
		args.push("--depends", dependency);
	}
	for (const attachment of input.attachments ?? []) {
		args.push("--attach", attachment);
	}
	return { command: "fn", args };
}

export function buildFusionProjectListCommand(): FusionCliCommand {
	return { command: "fn", args: ["project", "list", "--json"] };
}

export function buildFusionNodeListCommand(): FusionCliCommand {
	return { command: "fn", args: ["node", "list", "--json"] };
}

export function buildFusionMeshStatusCommand(): FusionCliCommand {
	return { command: "fn", args: ["mesh", "status", "--json"] };
}

export function parseFusionTaskCreateOutput(
	output: string,
): FusionTaskCreateResult {
	const taskMatch =
		output.match(/(?:Created|Linked existing)\s+([A-Z]+-\d+)/) ??
		output.match(/\b([A-Z]+-\d+)\b/);
	if (!taskMatch?.[1]) {
		throw new Error("Fusion task create output did not contain a task id");
	}
	const columnMatch = output.match(/Column:\s*([a-z-]+)/i);
	const pathMatch = output.match(/Path:\s*(.+)$/im);
	return {
		taskId: taskMatch[1],
		...(columnMatch?.[1] ? { column: columnMatch[1] } : {}),
		...(pathMatch?.[1] ? { path: pathMatch[1].trim() } : {}),
		linkedExisting: /Linked existing/i.test(output),
		rawOutput: output,
	};
}

export function parseFusionTaskCreateRunResult(
	result: FusionCliRunResult,
): FusionTaskCreateResult {
	if (hasStdout(result)) return parseFusionTaskCreateOutput(result.stdout);
	throw new Error(
		`Fusion task create failed (${result.exitCode}): ${cliOutput(result)}`,
	);
}

function parseJsonFromCliOutput(output: string): unknown {
	const trimmed = output.trim();
	if (trimmed.length === 0) return undefined;
	const starts = [...trimmed]
		.map((char, index) => ({ char, index }))
		.filter(({ char }) => char === "{" || char === "[")
		.map(({ index }) => index);
	for (const start of starts) {
		try {
			return JSON.parse(trimmed.slice(start));
		} catch {}
	}
	throw new Error("Fusion CLI output did not contain parseable JSON");
}

export function parseFusionProjectListOutput(output: string): FusionProject[] {
	const parsed = parseJsonFromCliOutput(output);
	return fusionProjectSchema.array().parse(parsed);
}

export function parseFusionNodeListOutput(output: string): FusionNode[] {
	const parsed = parseJsonFromCliOutput(output);
	return fusionNodeSchema.array().parse(parsed);
}

function cliOutput(result: FusionCliRunResult): string {
	return result.stderr || result.stdout;
}

function hasStdout(result: FusionCliRunResult): boolean {
	return result.stdout.trim().length > 0;
}

export function parseFusionProjectListRunResult(
	result: FusionCliRunResult,
): FusionProject[] {
	if (hasStdout(result)) return parseFusionProjectListOutput(result.stdout);
	throw new Error(
		`Fusion project list failed (${result.exitCode}): ${cliOutput(result)}`,
	);
}

export function parseFusionNodeListRunResult(
	result: FusionCliRunResult,
): FusionNode[] {
	if (hasStdout(result)) return parseFusionNodeListOutput(result.stdout);
	throw new Error(
		`Fusion node list failed (${result.exitCode}): ${cliOutput(result)}`,
	);
}

export async function runFusionCli(
	args: string[],
	options: FusionCliRunOptions = {},
): Promise<FusionCliRunResult> {
	const command = options.command ?? "fn";
	let timedOut = false;
	const proc = Bun.spawn([command, ...args], {
		cwd: options.cwd,
		env: options.env,
		stdout: "pipe",
		stderr: "pipe",
	});
	const timeout =
		options.timeoutMs === undefined
			? undefined
			: setTimeout(() => {
					timedOut = true;
					proc.kill("SIGTERM");
				}, options.timeoutMs);
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	if (timeout) clearTimeout(timeout);
	return { stdout, stderr, exitCode, timedOut };
}

export async function getFusionCliVersion(
	options: FusionCliRunOptions = {},
): Promise<string> {
	const result = await runFusionCli(["--version"], options);
	if (result.exitCode !== 0 || result.timedOut) {
		throw new Error(
			`Fusion version check failed (${result.exitCode}): ${result.stderr || result.stdout}`,
		);
	}
	return result.stdout.trim();
}

export class FusionCliClient {
	readonly command: "fn";
	readonly cwd?: string;
	readonly env?: Record<string, string | undefined>;
	readonly timeoutMs?: number;

	constructor(options: FusionCliRunOptions = {}) {
		this.command = options.command ?? "fn";
		this.cwd = options.cwd;
		this.env = options.env;
		this.timeoutMs = options.timeoutMs;
	}

	async createTask(
		input: FusionTaskCreateInput,
	): Promise<FusionTaskCreateResult> {
		const command = buildFusionTaskCreateCommand(input);
		const result = await runFusionCli(command.args, {
			command: this.command,
			cwd: this.cwd,
			env: this.env,
			timeoutMs: this.timeoutMs,
		});
		return parseFusionTaskCreateRunResult(result);
	}

	async listProjects(): Promise<FusionProject[]> {
		const command = buildFusionProjectListCommand();
		const result = await runFusionCli(command.args, {
			command: this.command,
			cwd: this.cwd,
			env: this.env,
			timeoutMs: this.timeoutMs,
		});
		return parseFusionProjectListRunResult(result);
	}

	async listNodes(): Promise<FusionNode[]> {
		const command = buildFusionNodeListCommand();
		const result = await runFusionCli(command.args, {
			command: this.command,
			cwd: this.cwd,
			env: this.env,
			timeoutMs: this.timeoutMs,
		});
		return parseFusionNodeListRunResult(result);
	}

	async version(): Promise<string> {
		return getFusionCliVersion({
			command: this.command,
			cwd: this.cwd,
			env: this.env,
			timeoutMs: this.timeoutMs,
		});
	}
}
