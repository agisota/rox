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

/**
 * Top-level route segments that take a runtime resource id (`/<segment>/<id>`)
 * and therefore can dead-end on a cold start: the id references a workspace /
 * project / host that may not exist for the current session, so restoring it
 * resolves to the router's `notFoundComponent` ("404 — Страница не найдена")
 * before any data is loaded. We keep the *static* index of these sections
 * (e.g. `/workspace`, `/v2-workspace`) restorable — only the id-scoped child is
 * collapsed back to the home route.
 */
const RESOURCE_SCOPED_SEGMENTS: ReadonlySet<string> = new Set([
	"workspace",
	"v2-workspace",
	"hosts",
]);

/**
 * The route a fresh launch should land on when the restored location is not
 * safely resolvable. `/` renders the index route, which redirects to the
 * authenticated home (`/workspace`).
 */
const HOME_PATH = "/";

/**
 * Decide whether a restored history path is safe to reopen on a cold launch.
 *
 * The persisted history can point at a deep resource route (e.g.
 * `/workspace/<id>`) captured in a previous session. On a fresh launch that
 * resource may not be present yet, so the router falls through to its
 * `notFoundComponent` and the app dead-ends on the 404 screen instead of the
 * home view. This guard returns `false` for those id-scoped routes so the
 * caller can fall back to {@link HOME_PATH}; every static route — including the
 * section index (`/workspace`) and settings pages — stays restorable.
 *
 * Pure and layout-independent (operates on the pathname only), so it is unit
 * testable without the generated route tree.
 */
export function isRestorableLocation(path: string): boolean {
	if (typeof path !== "string" || path.length === 0) return false;
	// Strip query/hash before inspecting the pathname.
	const pathname = path.split(/[?#]/, 1)[0] ?? path;
	if (!pathname.startsWith("/")) return false;
	if (pathname === HOME_PATH) return true;

	const segments = pathname.split("/").filter((segment) => segment.length > 0);
	const [head, child] = segments;
	// `/workspace`, `/v2-workspace`, `/hosts` (section index) — safe to restore.
	// `/workspace/<id>` and deeper — a runtime id that can dead-end cold.
	if (head && RESOURCE_SCOPED_SEGMENTS.has(head) && child !== undefined) {
		return false;
	}
	return true;
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
				// Guard the *restored current location* against cold-launch 404s: if
				// the entry we'd reopen points at an id-scoped resource route that may
				// not resolve this session, collapse the whole stack back to home so a
				// fresh launch lands on the index instead of "404 — Страница не
				// найдена". Static routes (incl. section indexes) restore unchanged.
				if (!isRestorableLocation(parsed.entries[index] ?? "")) {
					return { entries: [HOME_PATH], index: 0 };
				}
				return { entries: parsed.entries, index };
			}
		}
	} catch {}
	return { entries: [HOME_PATH], index: 0 };
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

	const entries: string[] = [...persisted.entries];
	const timestamps: number[] = entries.map(() => Date.now());
	const states: LocationState[] = entries.map((_entry, i) =>
		assignKeyAndIndex(i),
	);
	let index = persisted.index;

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

	return Object.assign(history, {
		getEntries: (): HistoryEntry[] =>
			entries.map((path, i) => ({
				path,
				timestamp: timestamps[i] ?? 0,
			})),
	});
}

export const persistentHistory = createPersistentHashHistory();
