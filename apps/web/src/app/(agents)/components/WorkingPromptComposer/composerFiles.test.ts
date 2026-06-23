import { describe, expect, it } from "bun:test";
import {
	type ComposerFilePart,
	extractDataUrlPayload,
	mapComposerFilesToHostAttachments,
} from "./composerFiles";

describe("extractDataUrlPayload", () => {
	it("returns the base64 payload after the comma of a data URL", () => {
		expect(extractDataUrlPayload("data:image/png;base64,QUJD")).toBe("QUJD");
	});

	it("forwards a non-data URL unchanged", () => {
		expect(extractDataUrlPayload("https://cdn.test/a.png")).toBe(
			"https://cdn.test/a.png",
		);
	});

	it("forwards a malformed data URL (no comma) unchanged", () => {
		expect(extractDataUrlPayload("data:image/png;base64")).toBe(
			"data:image/png;base64",
		);
	});
});

describe("mapComposerFilesToHostAttachments", () => {
	it("maps FileUIPart data URLs into host attachment payloads", () => {
		const files: ComposerFilePart[] = [
			{
				type: "file",
				mediaType: "image/png",
				filename: "shot.png",
				url: "data:image/png;base64,QUJD",
			},
		];
		expect(mapComposerFilesToHostAttachments(files)).toEqual([
			{ data: "QUJD", mediaType: "image/png", filename: "shot.png" },
		]);
	});

	it("omits filename when the part has none", () => {
		const files: ComposerFilePart[] = [
			{ type: "file", mediaType: "text/plain", url: "data:text/plain,hi" },
		];
		const [mapped] = mapComposerFilesToHostAttachments(files);
		expect(mapped).toEqual({ data: "hi", mediaType: "text/plain" });
		expect(mapped && "filename" in mapped).toBe(false);
	});

	it("maps an empty list to an empty list", () => {
		expect(mapComposerFilesToHostAttachments([])).toEqual([]);
	});
});
