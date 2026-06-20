/**
 * OS-browser history import (WS-N / D4 / N11).
 *
 * Reads the user's REAL browser history (Chrome / Arc / Brave / Chromium /
 * Safari) READ-ONLY and normalizes it for the per-workspace local store. The
 * pure time/normalization logic lives in `browser-import.utils.ts`; this module
 * owns the IO: locating the per-source history sqlite, copying the (often
 * locked) file to a temp path, opening it read-only, and querying.
 *
 * Nothing here runs until the caller has verified consent — the `browser-data`
 * tRPC router gates every entry point on the `browser_data_consent` row.
 */

import {
	closeSync,
	copyFileSync,
	existsSync,
	mkdtempSync,
	openSync,
	readdirSync,
	rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { checkFullDiskAccess } from "../../../lib/trpc/routers/permissions/full-disk-access";
import {
	type BrowserSource,
	type ChromiumUrlRow,
	dedupeImportedRows,
	type ImportedHistoryRow,
	isChromiumSource,
	normalizeChromiumRow,
	normalizeSafariRow,
	type SafariVisitRow,
} from "./browser-import.utils";

/** Max rows pulled per source per import to bound work + memory. */
const IMPORT_ROW_LIMIT = 5000;

/**
 * Resolve the candidate user-data directories for a Chromium-family source.
 * Mirrors the per-OS layout `getChromiumUserDataDirs()` uses for extensions,
 * scoped to a single source so the importer only touches what the user allowed.
 */
function chromiumUserDataDirs(source: BrowserSource): string[] {
	const home = os.homedir();
	const mac: Partial<Record<BrowserSource, string[]>> = {
		chrome: ["Library/Application Support/Google/Chrome"],
		"chrome-beta": ["Library/Application Support/Google/Chrome Beta"],
		"chrome-canary": ["Library/Application Support/Google/Chrome Canary"],
		chromium: ["Library/Application Support/Chromium"],
		brave: ["Library/Application Support/BraveSoftware/Brave-Browser"],
		arc: ["Library/Application Support/Arc/User Data"],
	};
	const win: Partial<Record<BrowserSource, string[]>> = {
		chrome: ["Google/Chrome/User Data"],
		"chrome-beta": ["Google/Chrome Beta/User Data"],
		"chrome-canary": ["Google/Chrome SxS/User Data"],
		chromium: ["Chromium/User Data"],
		brave: ["BraveSoftware/Brave-Browser/User Data"],
		arc: ["Arc/User Data"],
	};
	const linux: Partial<Record<BrowserSource, string[]>> = {
		chrome: [".config/google-chrome"],
		"chrome-beta": [".config/google-chrome-beta"],
		"chrome-canary": [".config/google-chrome-canary"],
		chromium: [".config/chromium"],
		brave: [".config/BraveSoftware/Brave-Browser"],
	};

	if (process.platform === "darwin") {
		return (mac[source] ?? []).map((rel) => path.join(home, rel));
	}
	if (process.platform === "win32") {
		const localAppData = process.env.LOCALAPPDATA;
		if (!localAppData) return [];
		return (win[source] ?? []).map((rel) => path.join(localAppData, rel));
	}
	return (linux[source] ?? []).map((rel) => path.join(home, rel));
}

/**
 * Find every `History` sqlite file across a Chromium user-data dir's profiles
 * ("Default", "Profile 1", …). Returns absolute paths that exist.
 */
function chromiumHistoryFiles(userDataDir: string): string[] {
	if (!existsSync(userDataDir)) return [];
	let profiles: string[];
	try {
		profiles = readdirSync(userDataDir);
	} catch {
		return [];
	}
	const candidates = profiles
		.filter((name) => name === "Default" || name.startsWith("Profile"))
		.map((name) => path.join(userDataDir, name, "History"));
	// Also consider a top-level History (some Chromium builds).
	candidates.push(path.join(userDataDir, "History"));
	return candidates.filter((p) => existsSync(p));
}

/** Safari history DB path (macOS only); needs Full Disk Access to read. */
function safariHistoryFile(): string | null {
	if (process.platform !== "darwin") return null;
	const p = path.join(os.homedir(), "Library/Safari/History.db");
	return existsSync(p) ? p : null;
}

/**
 * Copy a (possibly locked / WAL) sqlite file to a private temp path and read it.
 * `runner` receives the open read-only Database; the temp copy is always cleaned
 * up. Returns `[]` if the file can't be opened/copied.
 */
function withReadonlyCopy<T>(
	sourcePath: string,
	runner: (db: Database.Database) => T[],
): T[] {
	let tempDir: string | null = null;
	let db: Database.Database | null = null;
	try {
		tempDir = mkdtempSync(path.join(os.tmpdir(), "rox-bhist-"));
		const tempPath = path.join(tempDir, "History");
		copyFileSync(sourcePath, tempPath);
		db = new Database(tempPath, { readonly: true, fileMustExist: true });
		return runner(db);
	} catch {
		return [];
	} finally {
		if (db) {
			try {
				db.close();
			} catch {
				/* ignore */
			}
		}
		if (tempDir) {
			try {
				rmSync(tempDir, { recursive: true, force: true });
			} catch {
				/* ignore */
			}
		}
	}
}

function readChromiumHistory(historyFile: string): ImportedHistoryRow[] {
	return withReadonlyCopy<ImportedHistoryRow>(historyFile, (db) => {
		const rows = db
			.prepare(
				`SELECT url, title, last_visit_time
				 FROM urls
				 WHERE last_visit_time > 0
				 ORDER BY last_visit_time DESC
				 LIMIT ?`,
			)
			.all(IMPORT_ROW_LIMIT) as ChromiumUrlRow[];
		return rows
			.map(normalizeChromiumRow)
			.filter((r): r is ImportedHistoryRow => r !== null);
	});
}

function readSafariHistory(historyFile: string): ImportedHistoryRow[] {
	return withReadonlyCopy<ImportedHistoryRow>(historyFile, (db) => {
		const rows = db
			.prepare(
				`SELECT i.url AS url, v.title AS title, v.visit_time AS visit_time
				 FROM history_visits v
				 JOIN history_items i ON i.id = v.history_item
				 WHERE v.visit_time > 0
				 ORDER BY v.visit_time DESC
				 LIMIT ?`,
			)
			.all(IMPORT_ROW_LIMIT) as SafariVisitRow[];
		return rows
			.map(normalizeSafariRow)
			.filter((r): r is ImportedHistoryRow => r !== null);
	});
}

/** Whether a probe says the file is readable (FDA for Safari). */
function canReadProbe(filePath: string): boolean {
	try {
		const fd = openSync(filePath, "r");
		closeSync(fd);
		return true;
	} catch {
		return false;
	}
}

/**
 * Read + normalize history for a single OS-browser source. Safari is gated on
 * Full Disk Access (and silently no-ops without it). Returns deduped rows.
 */
export function importHistoryForSource(
	source: BrowserSource,
): ImportedHistoryRow[] {
	if (source === "safari") {
		const file = safariHistoryFile();
		if (!file) return [];
		// Safari's DB requires Full Disk Access; bail quietly when not granted.
		if (!checkFullDiskAccess() || !canReadProbe(file)) return [];
		return dedupeImportedRows(readSafariHistory(file));
	}

	if (!isChromiumSource(source)) return [];
	const rows: ImportedHistoryRow[] = [];
	for (const dir of chromiumUserDataDirs(source)) {
		for (const historyFile of chromiumHistoryFiles(dir)) {
			rows.push(...readChromiumHistory(historyFile));
		}
	}
	return dedupeImportedRows(rows);
}
