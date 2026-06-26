import { describe, expect, it } from "bun:test";
import {
	Braces,
	FileCode,
	File as FileIcon,
	FileType,
	Folder,
	FolderOpen,
	Settings,
	Terminal,
	Zap,
} from "lucide-react";
import { fileTreeRowIcon } from "./fileTreeRowIcon";

describe("fileTreeRowIcon", () => {
	it("maps the documented extensions to their icons", () => {
		expect(fileTreeRowIcon("app.js", false).Icon).toBe(Zap);
		expect(fileTreeRowIcon("main.py", false).Icon).toBe(FileCode);
		expect(fileTreeRowIcon("deploy.sh", false).Icon).toBe(Terminal);
		expect(fileTreeRowIcon("config", false).Icon).toBe(Settings);
	});

	it("carries a semantic color token per type", () => {
		expect(fileTreeRowIcon("app.js", false).colorToken).toBe("javascript");
		expect(fileTreeRowIcon("main.py", false).colorToken).toBe("python");
		expect(fileTreeRowIcon("deploy.sh", false).colorToken).toBe("shell");
		expect(fileTreeRowIcon("config", false).colorToken).toBe("config");
	});

	it("prefers the longest compound extension (d.ts before ts)", () => {
		expect(fileTreeRowIcon("types.d.ts", false).Icon).toBe(FileType);
		expect(fileTreeRowIcon("index.ts", false).Icon).toBe(FileType);
	});

	it("treats *.config.* filenames as config regardless of trailing ext", () => {
		expect(fileTreeRowIcon("vite.config.js", false)).toEqual({
			Icon: Settings,
			colorToken: "config",
		});
		expect(fileTreeRowIcon("vitest.config.ts", false).colorToken).toBe(
			"config",
		);
	});

	it("matches exact config filenames case-insensitively", () => {
		expect(fileTreeRowIcon("Dockerfile", false).colorToken).toBe("config");
		expect(fileTreeRowIcon(".gitignore", false).colorToken).toBe("config");
		expect(fileTreeRowIcon("CONFIG", false).Icon).toBe(Settings);
	});

	it("maps json to a braces icon", () => {
		expect(fileTreeRowIcon("package.json", false).Icon).toBe(Braces);
	});

	it("falls back to a generic file icon for unknown types", () => {
		expect(fileTreeRowIcon("mystery.qwerty", false)).toEqual({
			Icon: FileIcon,
			colorToken: "default",
		});
		expect(fileTreeRowIcon("noextension", false).Icon).toBe(FileIcon);
	});

	it("returns folder icons for directories, open-aware", () => {
		expect(fileTreeRowIcon("src", true).Icon).toBe(Folder);
		expect(fileTreeRowIcon("src", true, true).Icon).toBe(FolderOpen);
		expect(fileTreeRowIcon("src", true).colorToken).toBe("folder");
	});
});
