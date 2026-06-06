import type { StatusResult } from "simple-git";

/**
 * Parses git status --porcelain=v2 --branch -z output into a StatusResult-compatible object.
 * The -z format uses NUL characters to separate entries, which safely handles
 * filenames containing spaces, newlines, or other special characters.
 */
export function parsePorcelainStatusV2(stdout: string): StatusResult {
	// Split by NUL character - the -z format separates entries with NUL
	const entries = stdout.split("\0").filter(Boolean);

	let current: string | null = null;
	let tracking: string | null = null;
	let isDetached = false;
	let ahead = 0;
	let behind = 0;

	// Parse file status entries
	const files: StatusResult["files"] = [];
	// Use Sets to avoid duplicates (e.g., MM status would otherwise add to modified twice)
	const stagedSet = new Set<string>();
	const modifiedSet = new Set<string>();
	const deletedSet = new Set<string>();
	const createdSet = new Set<string>();
	const renamed: Array<{ from: string; to: string }> = [];
	const conflictedSet = new Set<string>();
	const notAddedSet = new Set<string>();

	const normalizeStatusCode = (code: string): string =>
		code === "." ? " " : code;
	const addFile = ({
		path,
		indexStatus,
		workingStatus,
		from,
	}: {
		path: string;
		indexStatus: string;
		workingStatus: string;
		from?: string;
	}) => {
		files.push({
			path,
			from: from ?? path,
			index: indexStatus,
			working_dir: workingStatus,
		});

		if (indexStatus === "?" && workingStatus === "?") {
			notAddedSet.add(path);
			return;
		}

		// Index status (staged changes)
		if (indexStatus === "A") createdSet.add(path);
		else if (indexStatus === "M") {
			stagedSet.add(path);
			modifiedSet.add(path);
		} else if (indexStatus === "D") {
			stagedSet.add(path);
			deletedSet.add(path);
		} else if (indexStatus === "R" || indexStatus === "C") stagedSet.add(path);
		else if (indexStatus === "U") conflictedSet.add(path);
		else if (indexStatus !== " " && indexStatus !== "?") stagedSet.add(path);

		// Working tree status (unstaged changes)
		if (workingStatus === "M") modifiedSet.add(path);
		else if (workingStatus === "D") deletedSet.add(path);
		else if (workingStatus === "U") conflictedSet.add(path);
	};

	let i = 0;
	while (i < entries.length) {
		const entry = entries[i];
		if (!entry) {
			i++;
			continue;
		}

		if (entry.startsWith("# ")) {
			const header = entry.slice(2);
			if (header.startsWith("branch.head ")) {
				const branchHead = header.slice("branch.head ".length);
				if (branchHead === "(detached)") {
					isDetached = true;
					current = "HEAD";
				} else {
					current = branchHead || null;
				}
			} else if (header.startsWith("branch.upstream ")) {
				tracking = header.slice("branch.upstream ".length) || null;
			} else if (header.startsWith("branch.ab ")) {
				const match = header.match(/^branch\.ab \+(\d+) -(\d+)$/);
				if (match) {
					ahead = Number.parseInt(match[1] || "0", 10);
					behind = Number.parseInt(match[2] || "0", 10);
				}
			}
			i++;
			continue;
		}

		if (entry.startsWith("? ")) {
			const path = entry.slice(2);
			addFile({
				path,
				indexStatus: "?",
				workingStatus: "?",
			});
			i++;
			continue;
		}

		// Ignored entries should not affect clean status.
		if (entry.startsWith("! ")) {
			i++;
			continue;
		}

		if (entry.startsWith("1 ")) {
			const match = entry.match(/^1 (\S{2}) \S+ \S+ \S+ \S+ \S+ \S+ (.+)$/);
			if (match) {
				const xy = match[1] || "..";
				const path = match[2];
				if (path) {
					addFile({
						path,
						indexStatus: normalizeStatusCode(xy[0] || "."),
						workingStatus: normalizeStatusCode(xy[1] || "."),
					});
				}
			}
			i++;
			continue;
		}

		if (entry.startsWith("2 ")) {
			const match = entry.match(/^2 (\S{2}) \S+ \S+ \S+ \S+ \S+ \S+ \S+ (.+)$/);
			const from = entries[i + 1];
			if (match) {
				const xy = match[1] || "..";
				const path = match[2];
				if (path) {
					const originalPath = from || path;
					renamed.push({ from: originalPath, to: path });
					addFile({
						path,
						from: originalPath,
						indexStatus: normalizeStatusCode(xy[0] || "."),
						workingStatus: normalizeStatusCode(xy[1] || "."),
					});
				}
			}
			i += 2;
			continue;
		}

		if (entry.startsWith("u ")) {
			const match = entry.match(
				/^u (\S{2}) \S+ \S+ \S+ \S+ \S+ \S+ \S+ \S+ (.+)$/,
			);
			if (match) {
				const xy = match[1] || "..";
				const path = match[2];
				if (path) {
					conflictedSet.add(path);
					addFile({
						path,
						indexStatus: normalizeStatusCode(xy[0] || "."),
						workingStatus: normalizeStatusCode(xy[1] || "."),
					});
				}
			}
		}

		i++;
	}

	return {
		not_added: [...notAddedSet],
		conflicted: [...conflictedSet],
		created: [...createdSet],
		deleted: [...deletedSet],
		ignored: undefined,
		modified: [...modifiedSet],
		renamed,
		files,
		staged: [...stagedSet],
		ahead,
		behind,
		current,
		tracking,
		detached: isDetached,
		isClean: () =>
			files.length === 0 ||
			files.every((f) => f.index === "?" && f.working_dir === "?"),
	};
}
