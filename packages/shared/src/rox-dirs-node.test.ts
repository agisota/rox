import { describe, expect, it } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	legacyRoxHomeDirFor,
	migrateRoxDir,
	resolveRoxHomePath,
} from "./rox-dirs-node";

describe("rox-dirs-node", () => {
	it("maps visible production and workspace homes to legacy dot-hidden homes", () => {
		expect(legacyRoxHomeDirFor("/Users/test/rox")).toBe("/Users/test/.rox");
		expect(legacyRoxHomeDirFor("/Users/test/rox-feature")).toBe(
			"/Users/test/.rox-feature",
		);
		expect(legacyRoxHomeDirFor("/Users/test/custom")).toBeNull();
	});

	it("prefers current paths and falls back to legacy paths for reads", () => {
		const root = mkdtempSync(join(tmpdir(), "rox-dirs-node-"));
		try {
			const currentHome = join(root, "rox-feature");
			const legacyHome = join(root, ".rox-feature");
			mkdirSync(join(legacyHome, "projects", "p1"), { recursive: true });
			writeFileSync(join(legacyHome, "projects", "p1", "config.json"), "{}");

			expect(
				resolveRoxHomePath(currentHome, "projects", "p1", "config.json"),
			).toBe(join(legacyHome, "projects", "p1", "config.json"));

			mkdirSync(join(currentHome, "projects", "p1"), { recursive: true });
			writeFileSync(join(currentHome, "projects", "p1", "config.json"), "{}");

			expect(
				resolveRoxHomePath(currentHome, "projects", "p1", "config.json"),
			).toBe(join(currentHome, "projects", "p1", "config.json"));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("does not migrate over an existing target", () => {
		const root = mkdtempSync(join(tmpdir(), "rox-dirs-node-"));
		try {
			const legacy = join(root, ".rox");
			const current = join(root, "rox");
			mkdirSync(legacy, { recursive: true });
			mkdirSync(current, { recursive: true });
			writeFileSync(join(legacy, "config.json"), "legacy");
			writeFileSync(join(current, "config.json"), "current");

			expect(migrateRoxDir(legacy, current)).toBe(false);
			expect(resolveRoxHomePath(current, "config.json")).toBe(
				join(current, "config.json"),
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
