import {
	createHistory,
	type HistoryLocation,
	type RouterHistory,
} from "@tanstack/react-router";

const STORAGE_KEY = "router-history";
const MAX_ENTRIES = 100;

type LocationState = HistoryLocation["state"];

interface PersistedState {
	entries: string[];
	index: number;
}

export interface HistoryEntry {
	path: string;
	timestamp: number;
}

function loadPersistedState(): PersistedState {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed = JSON.parse(raw) as PersistedState;
			if (
				Array.isArray(parsed.entries) &&
				parsed.entries.length > 0 &&
				parsed.entries.every((e) => typeof e === "string" && e.length > 0) &&
				typeof parsed.index === "number"
			) {
				const index = Math.min(
					Math.max(parsed.index, 0),
					parsed.entries.length - 1,
				);
				return { entries: parsed.entries, index };
			}
		}
	} catch {}
	return { entries: ["/"], index: 0 };
}

function loadInitialHashPath(): string | null {
	const hash =
		typeof window.location.hash === "string" ? window.location.hash : "";
	if (!hash || hash === "#") return null;

	const path = hash.startsWith("#") ? hash.slice(1) : hash;
	if (!path.startsWith("/") || path.length === 0) return null;

	return path;
}

function persistState(entries: string[], index: number) {
	try {
		const capped =
			entries.length > MAX_ENTRIES
				? entries.slice(entries.length - MAX_ENTRIES)
				: entries;
		const cappedIndex =
			entries.length > MAX_ENTRIES
				? Math.max(0, index - (entries.length - MAX_ENTRIES))
				: index;
		localStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ entries: capped, index: cappedIndex }),
		);
	} catch {}
}

function syncHash(path: string) {
	window.history.replaceState(window.history.state, "", `#${path}`);
}

function createRandomKey(): string {
	return (Math.random() + 1).toString(36).substring(7);
}

function assignKeyAndIndex(
	index: number,
	state?: LocationState,
): LocationState {
	const key = createRandomKey();
	return {
		...(state ?? {}),
		key,
		__TSR_key: key,
		__TSR_index: index,
	};
}

function parseHref(href: string, state: LocationState): HistoryLocation {
	const searchIndex = href.indexOf("?");
	const hashIndex = href.indexOf("#");
	return {
		href,
		pathname: href.substring(
			0,
			hashIndex > 0
				? searchIndex > 0
					? Math.min(hashIndex, searchIndex)
					: hashIndex
				: searchIndex > 0
					? searchIndex
					: href.length,
		),
		hash: hashIndex > -1 ? href.substring(hashIndex) : "",
		search:
			searchIndex > -1
				? href.slice(searchIndex, hashIndex === -1 ? undefined : hashIndex)
				: "",
		state,
	};
}

export interface PersistentHashHistory extends RouterHistory {
	getEntries: () => HistoryEntry[];
}

export function createPersistentHashHistory(): PersistentHashHistory {
	const persisted = loadPersistedState();
	const initialHashPath = loadInitialHashPath();

	const entries: string[] = [...persisted.entries];
	let index = persisted.index;

	if (initialHashPath && entries[index] !== initialHashPath) {
		const existingIndex = entries.indexOf(initialHashPath);
		if (existingIndex >= 0) {
			index = existingIndex;
		} else {
			if (index < entries.length - 1) {
				entries.splice(index + 1);
			}
			entries.push(initialHashPath);
			index = entries.length - 1;
		}
		persistState(entries, index);
	}

	const timestamps: number[] = entries.map(() => Date.now());
	const states: LocationState[] = entries.map((_entry, i) =>
		assignKeyAndIndex(i),
	);

	const applyExternalPath = (path: string): boolean => {
		if (entries[index] === path) return false;

		const existingIndex = entries.indexOf(path);
		if (existingIndex >= 0) {
			index = existingIndex;
			timestamps[index] = Date.now();
			states[index] = assignKeyAndIndex(index, states[index]);
			persistState(entries, index);
			return true;
		}

		if (index < entries.length - 1) {
			entries.splice(index + 1);
			timestamps.splice(index + 1);
			states.splice(index + 1);
		}
		entries.push(path);
		timestamps.push(Date.now());
		index = entries.length - 1;
		states.push(assignKeyAndIndex(index));
		persistState(entries, index);
		return true;
	};

	const getLocation = () =>
		parseHref(entries[index] ?? "/", states[index] ?? assignKeyAndIndex(index));

	let blockers: Parameters<
		NonNullable<Parameters<typeof createHistory>[0]["setBlockers"]>
	>[0] = [];

	syncHash(entries[index] ?? "/");

	const history = createHistory({
		getLocation,
		getLength: () => entries.length,
		pushState: (path, state) => {
			if (index < entries.length - 1) {
				entries.splice(index + 1);
				timestamps.splice(index + 1);
				states.splice(index + 1);
			}
			entries.push(path);
			timestamps.push(Date.now());
			states.push(state as LocationState);
			index = entries.length - 1;
			syncHash(path);
			persistState(entries, index);
		},
		replaceState: (path, state) => {
			entries[index] = path;
			timestamps[index] = Date.now();
			states[index] = state as LocationState;
			syncHash(path);
			persistState(entries, index);
		},
		back: () => {
			index = Math.max(index - 1, 0);
			syncHash(entries[index] ?? "/");
			persistState(entries, index);
		},
		forward: () => {
			index = Math.min(index + 1, entries.length - 1);
			syncHash(entries[index] ?? "/");
			persistState(entries, index);
		},
		go: (n) => {
			index = Math.min(Math.max(index + n, 0), entries.length - 1);
			syncHash(entries[index] ?? "/");
			persistState(entries, index);
		},
		createHref: (path) =>
			`${window.location.pathname}${window.location.search}#${path}`,
		getBlockers: () => blockers,
		setBlockers: (newBlockers) => {
			blockers = newBlockers;
		},
	});

	const onHashChange = () => {
		const nextPath = loadInitialHashPath();
		if (!nextPath) return;
		if (applyExternalPath(nextPath)) {
			history.notify({ type: "PUSH" });
		}
	};

	window.addEventListener("hashchange", onHashChange);
	const destroy = history.destroy;

	return Object.assign(history, {
		destroy: () => {
			window.removeEventListener("hashchange", onHashChange);
			destroy();
		},
		getEntries: (): HistoryEntry[] =>
			entries.map((path, i) => ({
				path,
				timestamp: timestamps[i] ?? 0,
			})),
	});
}

export const persistentHistory = createPersistentHashHistory();
