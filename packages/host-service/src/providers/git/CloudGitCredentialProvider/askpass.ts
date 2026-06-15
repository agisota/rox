import { randomUUID } from "node:crypto";
import { chmod, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function writeTempAskpass(token: string): Promise<string> {
	// The token is interpolated into the /bin/sh script below, so it must not
	// carry shell metacharacters (" ` $ newline). Real git credential tokens
	// (GitHub App `ghs_…`, OAuth `gho_…`, PAT `github_pat_…`) are [A-Za-z0-9_-];
	// reject anything else fail-closed rather than risk shell injection if the
	// token source ever changes.
	if (!/^[A-Za-z0-9_-]+$/.test(token)) {
		throw new Error("askpass token contains unsupported characters");
	}
	const filePath = join(tmpdir(), `git-askpass-${randomUUID()}.sh`);
	const script = `#!/bin/sh
case "$1" in
  Username*) echo "x-access-token" ;;
  *) echo "${token}" ;;
esac
`;
	await writeFile(filePath, script);
	await chmod(filePath, 0o700);
	return filePath;
}
