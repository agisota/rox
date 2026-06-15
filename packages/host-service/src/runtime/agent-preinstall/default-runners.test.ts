import { describe, expect, it } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultWriteConfigFile } from "./default-runners";

describe("defaultWriteConfigFile", () => {
	it("does not overwrite an existing file when overwrite is false", async () => {
		const dir = await mkdtemp(join(tmpdir(), "rox-agent-preinstall-"));
		try {
			const path = join(dir, "odw.config.json");
			await writeFile(path, "existing", "utf8");

			await defaultWriteConfigFile(path, "replacement", { overwrite: false });

			expect(await readFile(path, "utf8")).toBe("existing");
		} finally {
			await rm(dir, { force: true, recursive: true });
		}
	});
});
