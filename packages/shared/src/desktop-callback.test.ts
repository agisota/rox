import { describe, expect, it } from "bun:test";
import { parseDesktopLoopbackCallback } from "./desktop-callback";

describe("parseDesktopLoopbackCallback", () => {
	it("accepts http loopback /auth/callback", () => {
		for (const base of [
			"http://127.0.0.1:5173/auth/callback",
			"http://localhost:43117/auth/callback",
		]) {
			const url = parseDesktopLoopbackCallback(base);
			expect(url).not.toBeNull();
			expect(url?.pathname).toBe("/auth/callback");
		}
	});

	it("rejects non-loopback hosts (token-exfiltration guard)", () => {
		for (const base of [
			"https://evil.example/grab",
			"http://evil.example/auth/callback",
			"http://127.0.0.1.evil.com/auth/callback",
			"//evil.example/auth/callback",
		]) {
			expect(parseDesktopLoopbackCallback(base)).toBeNull();
		}
	});

	it("rejects non-loopback-http schemes", () => {
		for (const base of [
			"https://127.0.0.1/auth/callback",
			"javascript:alert(1)//auth/callback",
			"file:///auth/callback",
		]) {
			expect(parseDesktopLoopbackCallback(base)).toBeNull();
		}
	});

	it("rejects a wrong pathname on a loopback host", () => {
		expect(
			parseDesktopLoopbackCallback("http://127.0.0.1:5173/evil"),
		).toBeNull();
	});

	it("returns null for empty/garbage input", () => {
		expect(parseDesktopLoopbackCallback(undefined)).toBeNull();
		expect(parseDesktopLoopbackCallback(null)).toBeNull();
		expect(parseDesktopLoopbackCallback("")).toBeNull();
		expect(parseDesktopLoopbackCallback("not a url")).toBeNull();
	});
});
