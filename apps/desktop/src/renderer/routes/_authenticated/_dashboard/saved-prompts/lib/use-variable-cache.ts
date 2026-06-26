import { useCallback } from "react";

/**
 * Per-prompt cache of the last variable-fill values, so re-using a prompt
 * pre-fills what the user typed before. Stored in `localStorage` (renderer is a
 * single trusted desktop origin); read/write are defensive so a quota error or
 * private mode never breaks insertion.
 */
const STORAGE_PREFIX = "rox:saved-prompts:vars:";

function keyFor(promptId: string): string {
	return `${STORAGE_PREFIX}${promptId}`;
}

export function readCachedVariables(
	promptId: string,
): Record<string, string> | undefined {
	try {
		const raw = window.localStorage.getItem(keyFor(promptId));
		if (!raw) return undefined;
		const parsed = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return undefined;
		const out: Record<string, string> = {};
		for (const [name, value] of Object.entries(parsed)) {
			if (typeof value === "string") out[name] = value;
		}
		return out;
	} catch {
		return undefined;
	}
}

function writeCachedVariables(
	promptId: string,
	values: Record<string, string>,
): void {
	try {
		window.localStorage.setItem(keyFor(promptId), JSON.stringify(values));
	} catch {
		// Best-effort persistence — ignore quota/serialization failures.
	}
}

export function useVariableCache() {
	const read = useCallback(
		(promptId: string) => readCachedVariables(promptId),
		[],
	);
	const write = useCallback(
		(promptId: string, values: Record<string, string>) =>
			writeCachedVariables(promptId, values),
		[],
	);
	return { read, write };
}
