import { exec } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";
import { getStrictShellEnvironment } from "../../terminal/clean-shell-env";
import type { CommandRunner, ConfigFileWriter } from "./installer-types";

const execAsync = promisify(exec);

/** Default config writer: creates parent dirs then writes the file via fs. */
export const defaultWriteConfigFile: ConfigFileWriter = async (
	absolutePath,
	contents,
	options,
) => {
	await mkdir(dirname(absolutePath), { recursive: true });
	try {
		await writeFile(absolutePath, contents, {
			encoding: "utf8",
			flag: options?.overwrite === false ? "wx" : "w",
		});
	} catch (error) {
		if (
			options?.overwrite === false &&
			error instanceof Error &&
			"code" in error &&
			error.code === "EEXIST"
		) {
			return;
		}
		throw error;
	}
};

/**
 * Default command runner: executes the command in a clean strict shell env and
 * normalizes both success and failure into a {@link CommandResult}, so callers
 * never have to catch — a non-zero exit is data, not an exception.
 */
export const defaultCommandRunner: CommandRunner = async (command) => {
	const env = await getStrictShellEnvironment().catch(
		() => process.env as Record<string, string>,
	);
	try {
		const { stdout, stderr } = await execAsync(command, {
			encoding: "utf8",
			env,
			timeout: 5 * 60_000,
		});
		return { exitCode: 0, stdout, stderr };
	} catch (error) {
		const err = error as {
			code?: number;
			stdout?: string;
			stderr?: string;
			message?: string;
		};
		return {
			exitCode: typeof err.code === "number" ? err.code : 1,
			stdout: err.stdout ?? "",
			stderr: err.stderr ?? err.message ?? "",
		};
	}
};
