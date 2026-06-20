import { describe, expect, it } from "bun:test";
import { PROTOCOL_SCHEMES } from "@rox/shared/constants";
import { buildContinueOnDesktopUrl } from "./buildContinueOnDesktopUrl";

describe("buildContinueOnDesktopUrl", () => {
	it("builds a rox:// deep link to agents/workspace with the host routing key", () => {
		const url = buildContinueOnDesktopUrl("workspace-1", "org-1:machine-9");
		expect(url).toBe(
			`${PROTOCOL_SCHEMES.PROD}://agents/workspace/workspace-1?host=org-1%3Amachine-9`,
		);
	});

	it("URL-encodes the routing key colon so org:machine survives the query", () => {
		const url = buildContinueOnDesktopUrl("w", "o:m");
		const parsed = new URL(url);
		expect(parsed.protocol).toBe(`${PROTOCOL_SCHEMES.PROD}:`);
		expect(parsed.searchParams.get("host")).toBe("o:m");
	});

	it("honours a dev scheme override", () => {
		const url = buildContinueOnDesktopUrl(
			"workspace-1",
			"org-1:machine-9",
			PROTOCOL_SCHEMES.DEV,
		);
		expect(url.startsWith(`${PROTOCOL_SCHEMES.DEV}://agents/workspace/`)).toBe(
			true,
		);
	});

	it("encodes special characters in the workspace id", () => {
		const url = buildContinueOnDesktopUrl("a/b id", "o:m");
		expect(url).toContain("agents/workspace/a%2Fb%20id");
	});
});
