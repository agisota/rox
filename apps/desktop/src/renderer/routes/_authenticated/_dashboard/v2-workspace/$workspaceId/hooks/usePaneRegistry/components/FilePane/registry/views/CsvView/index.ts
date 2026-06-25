import { isCsvFile } from "shared/file-types";
import type { FileView } from "../../types";
import { CsvView } from "./CsvView";

export const csvView: FileView = {
	id: "csv",
	label: "Table",
	match: (filePath) => isCsvFile(filePath),
	priority: "default",
	documentKind: "text",
	Renderer: CsvView,
};
