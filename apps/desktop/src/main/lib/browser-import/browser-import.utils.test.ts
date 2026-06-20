import { describe, expect, it } from "bun:test";
import {
	chromiumTimeToEpochMs,
	dedupeImportedRows,
	type ImportedHistoryRow,
	isChromiumSource,
	isHttpUrl,
	normalizeChromiumRow,
	normalizeSafariRow,
	safariTimeToEpochMs,
} from "./browser-import.utils";

const CHROMIUM_EPOCH_OFFSET_MICROS = 11_644_473_600_000_000;
const SAFARI_EPOCH_OFFSET_SECONDS = 978_307_200;

/** 2021-01-01T00:00:00Z in epoch ms. */
const KNOWN_MS = Date.UTC(2021, 0, 1);

describe("chromiumTimeToEpochMs", () => {
	it("converts microseconds-since-1601 to epoch ms", () => {
		const micros = KNOWN_MS * 1000 + CHROMIUM_EPOCH_OFFSET_MICROS;
		expect(chromiumTimeToEpochMs(micros)).toBe(KNOWN_MS);
	});

	it("returns 0 for non-positive / NaN inputs", () => {
		expect(chromiumTimeToEpochMs(0)).toBe(0);
		expect(chromiumTimeToEpochMs(-5)).toBe(0);
		expect(chromiumTimeToEpochMs(Number.NaN)).toBe(0);
	});
});

describe("safariTimeToEpochMs", () => {
	it("converts seconds-since-2001 to epoch ms", () => {
		const seconds = KNOWN_MS / 1000 - SAFARI_EPOCH_OFFSET_SECONDS;
		expect(safariTimeToEpochMs(seconds)).toBe(KNOWN_MS);
	});

	it("returns 0 for non-positive inputs", () => {
		expect(safariTimeToEpochMs(0)).toBe(0);
		expect(safariTimeToEpochMs(-1)).toBe(0);
	});
});

describe("isHttpUrl / isChromiumSource", () => {
	it("accepts only http(s) urls", () => {
		expect(isHttpUrl("https://a.test")).toBe(true);
		expect(isHttpUrl("http://a.test")).toBe(true);
		expect(isHttpUrl("chrome://settings")).toBe(false);
		expect(isHttpUrl("file:///x")).toBe(false);
		expect(isHttpUrl("javascript:alert(1)")).toBe(false);
	});

	it("classifies chromium vs safari sources", () => {
		expect(isChromiumSource("chrome")).toBe(true);
		expect(isChromiumSource("arc")).toBe(true);
		expect(isChromiumSource("safari")).toBe(false);
		expect(isChromiumSource("firefox")).toBe(false);
	});
});

describe("normalizeChromiumRow", () => {
	it("normalizes a valid row to an import entry", () => {
		const micros = KNOWN_MS * 1000 + CHROMIUM_EPOCH_OFFSET_MICROS;
		const row = normalizeChromiumRow({
			url: "https://example.test/page",
			title: "Example",
			last_visit_time: micros,
		});
		expect(row).toEqual({
			url: "https://example.test/page",
			title: "Example",
			faviconUrl: null,
			visitedAt: KNOWN_MS,
			source: "import",
		});
	});

	it("drops non-http urls and never-visited rows", () => {
		expect(
			normalizeChromiumRow({
				url: "chrome://settings",
				title: "x",
				last_visit_time: 1,
			}),
		).toBeNull();
		expect(
			normalizeChromiumRow({
				url: "https://example.test",
				title: "x",
				last_visit_time: 0,
			}),
		).toBeNull();
	});

	it("defaults a null title to an empty string", () => {
		const micros = KNOWN_MS * 1000 + CHROMIUM_EPOCH_OFFSET_MICROS;
		const row = normalizeChromiumRow({
			url: "https://a.test",
			title: null,
			last_visit_time: micros,
		});
		expect(row?.title).toBe("");
	});
});

describe("normalizeSafariRow", () => {
	it("normalizes a valid Safari row", () => {
		const seconds = KNOWN_MS / 1000 - SAFARI_EPOCH_OFFSET_SECONDS;
		const row = normalizeSafariRow({
			url: "https://safari.test",
			title: "Safari",
			visit_time: seconds,
		});
		expect(row?.url).toBe("https://safari.test");
		expect(row?.visitedAt).toBe(KNOWN_MS);
		expect(row?.source).toBe("import");
	});
});

describe("dedupeImportedRows", () => {
	it("collapses identical (url, visitedAt) rows but keeps distinct visits", () => {
		const rows: ImportedHistoryRow[] = [
			{
				url: "https://a.test",
				title: "A",
				faviconUrl: null,
				visitedAt: 1,
				source: "import",
			},
			{
				url: "https://a.test",
				title: "A2",
				faviconUrl: null,
				visitedAt: 1,
				source: "import",
			},
			{
				url: "https://a.test",
				title: "A",
				faviconUrl: null,
				visitedAt: 2,
				source: "import",
			},
		];
		const out = dedupeImportedRows(rows);
		expect(out).toHaveLength(2);
		expect(out[0]?.title).toBe("A");
		expect(out.map((r) => r.visitedAt).sort()).toEqual([1, 2]);
	});
});
