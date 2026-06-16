import path from "node:path";

/**
 * Normalizes a source location reported by a bundler/source map into a
 * workspace-relative file path, enforcing that it resolves *inside* the
 * workspace root (spec §10.8/§10.9 — never read or reference files outside the
 * workspace). Returns `null` when the path is unusable or escapes the root.
 */

/** True when `absolutePath` is the root itself or nested inside it. */
function isPathWithinRoot(rootPath: string, absolutePath: string): boolean {
	const root = path.normalize(path.resolve(rootPath));
	const target = path.normalize(path.resolve(absolutePath));
	if (root === target) return true;
	const rel = path.relative(root, target);
	return (
		rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
	);
}

const PREFIXES = [
	/^webpack-internal:\/\/\//,
	/^webpack:\/\/\//,
	/^webpack:\/\/[^/]*\//, // webpack://<namespace>/
	/^vite:\/\//,
	/^rsbuild:\/\/\//,
	/^file:\/\//,
];

/** Strips bundler URL scheme/namespace noise and query/hash, leaving a path. */
export function stripSourceUrlPrefix(raw: string): string {
	let out = raw.trim();
	// Drop query string + hash.
	out = out.replace(/[?#].*$/, "");

	// http(s)://host[:port]/rest -> /rest
	const httpMatch = out.match(/^https?:\/\/[^/]+(\/.*)?$/);
	if (httpMatch) out = httpMatch[1] ?? "/";

	for (const prefix of PREFIXES) {
		if (prefix.test(out)) {
			out = out.replace(prefix, "");
			break;
		}
	}
	// Common relative markers emitted in source maps.
	out = out.replace(/^\.\//, "").replace(/^~\//, "");
	return out;
}

export type NormalizedSource = {
	/** Path relative to the workspace root, POSIX-style. */
	filePath: string;
	/** Absolute path on disk. */
	absolutePath: string;
};

export function normalizeSourcePath(
	workspaceRoot: string,
	rawSourcePath: string,
): NormalizedSource | null {
	if (!workspaceRoot || !rawSourcePath) return null;

	const stripped = stripSourceUrlPrefix(rawSourcePath);
	// A path extracted from an http(s) dev URL is server-absolute ("/src/..."),
	// but maps to a workspace-relative file — treat it as relative to the root.
	const fromHttpUrl = /^https?:\/\//i.test(rawSourcePath.trim());
	const candidate = fromHttpUrl ? stripped.replace(/^\/+/, "") : stripped;
	if (!candidate) return null;

	// Resolve absolute candidates against the FS; relative ones against the root.
	const absolutePath = path.isAbsolute(candidate)
		? path.normalize(candidate)
		: path.resolve(workspaceRoot, candidate);

	if (!isPathWithinRoot(workspaceRoot, absolutePath)) return null;

	const rel = path.relative(workspaceRoot, absolutePath);
	if (!rel || rel.startsWith("..")) return null;

	return {
		filePath: rel.split(path.sep).join("/"),
		absolutePath,
	};
}

/** Infers a framework from a file extension, for capture source metadata. */
export function inferFramework(
	filePath: string,
): "react" | "vue" | "svelte" | "unknown" {
	if (/\.(tsx|jsx)$/.test(filePath)) return "react";
	if (/\.vue$/.test(filePath)) return "vue";
	if (/\.svelte$/.test(filePath)) return "svelte";
	return "unknown";
}
