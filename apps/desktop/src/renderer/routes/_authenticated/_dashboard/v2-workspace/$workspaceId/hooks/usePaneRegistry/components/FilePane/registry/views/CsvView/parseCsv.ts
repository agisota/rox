import Papa from "papaparse";

export interface ParsedCsv {
	/** First row, used as the table header. */
	headers: string[];
	/** Remaining rows; each cell is a string. */
	rows: string[][];
	/** Non-fatal parse errors, surfaced as a hint to the user. */
	errors: string[];
}

/**
 * Parse CSV / TSV text into a header + rows shape for tabular rendering.
 * Quote-aware via papaparse; the first non-empty row becomes the header.
 */
export function parseCsv(text: string, delimiter: string): ParsedCsv {
	const result = Papa.parse<string[]>(text, {
		delimiter,
		skipEmptyLines: "greedy",
	});

	const data = result.data.filter((row) => Array.isArray(row));
	const [headerRow, ...bodyRows] = data;

	return {
		headers: headerRow ?? [],
		rows: bodyRows,
		errors: result.errors.map((e) => e.message),
	};
}
