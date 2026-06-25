import { describe, expect, it } from "bun:test";
import {
	bundledGitDirName,
	bundledGitRelativeExecPath,
	bundledGitResourceSegments,
	resolveGitBinaryFrom,
} from "./git-binary";

describe("bundled git path layout", () => {
	it("names the bundle dir by platform-arch", () => {
		expect(bundledGitDirName("darwin", "arm64")).toBe("darwin-arm64");
		expect(bundledGitDirName("win32", "x64")).toBe("win32-x64");
		expect(bundledGitDirName("linux", "x64")).toBe("linux-x64");
	});

	it("locates the git executable inside the bundle per platform", () => {
		expect(bundledGitRelativeExecPath("darwin")).toBe("bin/git");
		expect(bundledGitRelativeExecPath("linux")).toBe("bin/git");
		expect(bundledGitRelativeExecPath("win32")).toBe("cmd/git.exe");
	});

	it("produces join-able resource segments", () => {
		expect(bundledGitResourceSegments("darwin", "arm64")).toEqual([
			"resources",
			"git",
			"darwin-arm64",
			"bin",
			"git",
		]);
		expect(bundledGitResourceSegments("win32", "x64")).toEqual([
			"resources",
			"git",
			"win32-x64",
			"cmd",
			"git.exe",
		]);
	});
});

describe("resolveGitBinaryFrom", () => {
	it("prefers system git when available", () => {
		expect(
			resolveGitBinaryFrom({
				systemGitAvailable: true,
				bundledGitPath: "/Applications/Rox.app/.../git",
			}),
		).toEqual({ binary: "git", source: "system" });
	});

	it("falls back to the bundled git when system git is absent", () => {
		expect(
			resolveGitBinaryFrom({
				systemGitAvailable: false,
				bundledGitPath: "/opt/rox/resources/git/linux-x64/bin/git",
			}),
		).toEqual({
			binary: "/opt/rox/resources/git/linux-x64/bin/git",
			source: "bundled",
		});
	});

	it("returns the PATH name as a last resort so ENOENT can surface friendly", () => {
		expect(
			resolveGitBinaryFrom({
				systemGitAvailable: false,
				bundledGitPath: null,
			}),
		).toEqual({ binary: "git", source: "fallback" });
	});
});
