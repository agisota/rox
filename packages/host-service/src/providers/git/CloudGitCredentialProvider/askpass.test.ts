import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { writeTempAskpass } from "../askpass";

describe("writeTempAskpass", () => {
	it("writes an askpass script that echoes a valid token", async () => {
		const filePath = await writeTempAskpass("ghs_AbC123_def-456");
		const script = readFileSync(filePath, "utf-8");
		expect(script).toContain("ghs_AbC123_def-456");
		expect(script).toContain("x-access-token");
	});

	it("rejects tokens with shell metacharacters (injection guard)", async () => {
		const dangerous = [
			'a"b',
			"a`b`",
			"a$b",
			"a\nb",
			"a;b",
			"a b",
			"a'b",
			"a|b",
		];
		for (const token of dangerous) {
			let message = "";
			try {
				await writeTempAskpass(token);
			} catch (error) {
				message = error instanceof Error ? error.message : String(error);
			}
			expect(message).toContain("unsupported characters");
		}
	});
});
