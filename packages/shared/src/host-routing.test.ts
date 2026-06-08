import { describe, expect, it } from "bun:test";
import {
	buildHostEndpoint,
	buildHostRoutingKey,
	formatHostAddress,
	parseHostEndpoint,
	parseHostRoutingKey,
} from "./host-routing";

describe("buildHostRoutingKey / parseHostRoutingKey", () => {
	it("round-trips org + machine id", () => {
		const key = buildHostRoutingKey("org-1", "machine-9");
		expect(key).toBe("org-1:machine-9");
		expect(parseHostRoutingKey(key)).toEqual({
			organizationId: "org-1",
			machineId: "machine-9",
		});
	});

	it("keeps colons inside the machine id", () => {
		expect(parseHostRoutingKey("org:a:b:c")).toEqual({
			organizationId: "org",
			machineId: "a:b:c",
		});
	});

	it("rejects malformed keys", () => {
		expect(parseHostRoutingKey(":machine")).toBeNull();
		expect(parseHostRoutingKey("org:")).toBeNull();
		expect(parseHostRoutingKey("nocolon")).toBeNull();
	});
});

describe("buildHostEndpoint / parseHostEndpoint", () => {
	it("encodes protocol://host:port", () => {
		expect(
			buildHostEndpoint({
				host: "sbx.daytona.io",
				port: 443,
				protocol: "https",
			}),
		).toBe("https://sbx.daytona.io:443");
	});

	it("defaults protocol to https", () => {
		expect(buildHostEndpoint({ host: "10.0.0.5", port: 8080 })).toBe(
			"https://10.0.0.5:8080",
		);
	});

	it("round-trips the encoded form", () => {
		const encoded = buildHostEndpoint({
			host: "host.example",
			port: 9000,
			protocol: "wss",
		});
		expect(parseHostEndpoint(encoded)).toEqual({
			host: "host.example",
			port: 9000,
			protocol: "wss",
		});
	});

	it("parses the bare host:port form with default protocol", () => {
		expect(parseHostEndpoint("host.example:1234")).toEqual({
			host: "host.example",
			port: 1234,
			protocol: "https",
		});
	});

	it("rejects invalid endpoints", () => {
		expect(parseHostEndpoint("")).toBeNull();
		expect(parseHostEndpoint("host-only")).toBeNull();
		expect(parseHostEndpoint("host:notaport")).toBeNull();
		expect(parseHostEndpoint("host:0")).toBeNull();
		expect(parseHostEndpoint("host:70000")).toBeNull();
	});
});

describe("formatHostAddress", () => {
	it("returns null without a port", () => {
		expect(formatHostAddress(null)).toBeNull();
		expect(formatHostAddress(undefined)).toBeNull();
	});

	it("formats with protocol and host", () => {
		expect(formatHostAddress(443, "https", "sbx.io")).toBe(
			"https://sbx.io:443",
		);
	});

	it("formats port-only when host is absent", () => {
		expect(formatHostAddress(8080)).toBe(":8080");
	});
});
