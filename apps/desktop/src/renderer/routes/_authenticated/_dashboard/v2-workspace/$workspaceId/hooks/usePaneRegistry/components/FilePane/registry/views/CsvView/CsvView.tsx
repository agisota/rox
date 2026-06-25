import { useMemo } from "react";
import { getCsvDelimiter } from "shared/file-types";
import type { ViewProps } from "../../types";
import { FormatBadge } from "../components/FormatBadge";
import { parseCsv } from "./parseCsv";

/**
 * Tabular CSV / TSV preview. Parses the document text with papaparse and
 * renders a scrollable table with a sticky header row.
 */
export function CsvView({ document: doc, filePath }: ViewProps) {
	const text = doc.content.kind === "text" ? doc.content.value : null;
	const delimiter = getCsvDelimiter(filePath);

	const parsed = useMemo(
		() => (text === null ? null : parseCsv(text, delimiter)),
		[text, delimiter],
	);

	if (!parsed) {
		return null;
	}

	const label = delimiter === "\t" ? "TSV" : "CSV";

	if (parsed.headers.length === 0 && parsed.rows.length === 0) {
		return (
			<div className="relative flex h-full items-center justify-center text-muted-foreground text-sm">
				<FormatBadge label={label} colorClassName="bg-emerald-600 text-white" />
				Empty file
			</div>
		);
	}

	return (
		<div className="relative h-full overflow-auto bg-background">
			<FormatBadge label={label} colorClassName="bg-emerald-600 text-white" />
			<table className="w-full border-collapse text-sm tabular-nums">
				<thead className="sticky top-0 z-[1] bg-muted">
					<tr>
						<th className="border border-border px-2 py-1 text-right font-medium text-muted-foreground text-xs">
							#
						</th>
						{parsed.headers.map((cell, index) => (
							<th
								// biome-ignore lint/suspicious/noArrayIndexKey: CSV columns are positional and static per render
								key={index}
								className="border border-border px-2 py-1 text-left font-medium"
							>
								{cell}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{parsed.rows.map((row, rowIndex) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: CSV rows are positional and static per render
						<tr key={rowIndex} className="even:bg-muted/30">
							<td className="border border-border px-2 py-1 text-right text-muted-foreground text-xs">
								{rowIndex + 1}
							</td>
							{parsed.headers.map((_, colIndex) => (
								<td
									// biome-ignore lint/suspicious/noArrayIndexKey: CSV cells are positional and static per render
									key={colIndex}
									className="whitespace-pre border border-border px-2 py-1"
								>
									{row[colIndex] ?? ""}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
			{parsed.errors.length > 0 && (
				<div className="px-2 py-1 text-amber-600 text-xs">
					{parsed.errors.length} parse warning(s)
				</div>
			)}
		</div>
	);
}
