import { describe, expect, it } from "bun:test";
import {
	isLocalOrigin,
	isRemoteOrigin,
	shouldWarnBeforeCapture,
} from "./originPolicy";

describe("originPolicy", () => {
	it("treats localhost and loopback as local", () => {
		expect(isLocalOrigin("http://localhost:3000/app")).toBe(true);
		expect(isLocalOrigin("http://127.0.0.1:5173")).toBe(true);
		expect(isLocalOrigin("http://[::1]:8080")).toBe(true);
	});

	it("treats *.localhost and *.local as local", () => {
		expect(isLocalOrigin("http://app.localhost:3000")).toBe(true);
		expect(isLocalOrigin("http://mymac.local")).toBe(true);
	});

	it("treats private LAN ranges as local", () => {
		expect(isLocalOrigin("http://10.0.0.5")).toBe(true);
		expect(isLocalOrigin("http://192.168.1.20:3000")).toBe(true);
		expect(isLocalOrigin("http://172.16.4.4")).toBe(true);
		expect(isLocalOrigin("http://172.32.0.1")).toBe(false); // outside RFC1918
	});

	it("treats file/about as local and malformed urls as non-remote", () => {
		expect(isLocalOrigin("about:blank")).toBe(true);
		expect(isLocalOrigin("file:///Users/x/index.html")).toBe(true);
		expect(isLocalOrigin("not a url")).toBe(true);
	});

	it("flags public origins as remote", () => {
		expect(isRemoteOrigin("https://example.com")).toBe(true);
		expect(isRemoteOrigin("https://app.rox.one/dashboard")).toBe(true);
	});

	it("warns only for remote origins, and never when disabled", () => {
		expect(shouldWarnBeforeCapture("https://example.com")).toBe(true);
		expect(shouldWarnBeforeCapture("http://localhost:3000")).toBe(false);
		expect(shouldWarnBeforeCapture("https://example.com", false)).toBe(false);
	});
});
