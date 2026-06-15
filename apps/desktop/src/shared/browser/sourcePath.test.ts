import { describe, expect, it } from "bun:test";
import {
	inferFramework,
	normalizeSourcePath,
	stripSourceUrlPrefix,
} from "./sourcePath";

const ROOT = "/home/user/project";

describe("stripSourceUrlPrefix", () => {
	it("strips webpack and vite namespaces", () => {
		expect(stripSourceUrlPrefix("webpack://my-app/./src/App.tsx")).toBe(
			"src/App.tsx",
		);
		expect(
			stripSourceUrlPrefix("webpack-internal:///./src/components/Btn.tsx"),
		).toBe("src/components/Btn.tsx");
		expect(stripSourceUrlPrefix("vite://src/main.ts")).toBe("src/main.ts");
	});

	it("reduces http(s) dev urls to their path and drops query/hash", () => {
		expect(
			stripSourceUrlPrefix("http://localhost:3000/src/App.tsx?t=123"),
		).toBe("/src/App.tsx");
		expect(stripSourceUrlPrefix("https://localhost/src/x.tsx#L10")).toBe(
			"/src/x.tsx",
		);
	});

	it("strips file:// and leading ./", () => {
		expect(stripSourceUrlPrefix("file:///home/user/project/src/x.ts")).toBe(
			"/home/user/project/src/x.ts",
		);
		expect(stripSourceUrlPrefix("./src/x.ts")).toBe("src/x.ts");
	});
});

describe("normalizeSourcePath", () => {
	it("resolves a relative source to a workspace-relative path", () => {
		const r = normalizeSourcePath(ROOT, "webpack://app/./src/App.tsx");
		expect(r).toEqual({
			filePath: "src/App.tsx",
			absolutePath: `${ROOT}/src/App.tsx`,
		});
	});

	it("accepts absolute paths inside the root", () => {
		const r = normalizeSourcePath(ROOT, `${ROOT}/src/components/Card.tsx`);
		expect(r?.filePath).toBe("src/components/Card.tsx");
	});

	it("rejects paths that escape the workspace root", () => {
		expect(normalizeSourcePath(ROOT, "../../../etc/passwd")).toBeNull();
		expect(normalizeSourcePath(ROOT, "/etc/passwd")).toBeNull();
		expect(
			normalizeSourcePath(ROOT, "webpack://app/../../secret.tsx"),
		).toBeNull();
	});

	it("returns null for empty inputs", () => {
		expect(normalizeSourcePath(ROOT, "")).toBeNull();
		expect(normalizeSourcePath("", "src/App.tsx")).toBeNull();
	});
});

describe("inferFramework", () => {
	it("maps extensions to frameworks", () => {
		expect(inferFramework("src/App.tsx")).toBe("react");
		expect(inferFramework("src/App.jsx")).toBe("react");
		expect(inferFramework("src/App.vue")).toBe("vue");
		expect(inferFramework("src/App.svelte")).toBe("svelte");
		expect(inferFramework("src/util.ts")).toBe("unknown");
	});
});
