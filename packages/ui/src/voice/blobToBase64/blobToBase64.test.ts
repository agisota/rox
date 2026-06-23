import { describe, expect, it } from "bun:test";
import { blobToBase64 } from "./blobToBase64";

describe("blobToBase64", () => {
	it("encodes bytes to base64 with no data-URL prefix", async () => {
		const blob = new Blob([new Uint8Array([104, 105])], {
			type: "application/octet-stream",
		});
		// "hi" -> base64 "aGk="
		expect(await blobToBase64(blob)).toBe("aGk=");
	});

	it("returns an empty string for an empty blob", async () => {
		const blob = new Blob([], { type: "audio/webm" });
		expect(await blobToBase64(blob)).toBe("");
	});

	it("round-trips a larger buffer that crosses the chunk boundary", async () => {
		const bytes = new Uint8Array(0x8000 + 5).map((_, i) => i % 251);
		const blob = new Blob([bytes], { type: "audio/webm" });
		const base64 = await blobToBase64(blob);
		const decoded = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
		expect(decoded.length).toBe(bytes.length);
		expect(decoded[0]).toBe(bytes[0]);
		expect(decoded[decoded.length - 1]).toBe(bytes[bytes.length - 1]);
	});
});
