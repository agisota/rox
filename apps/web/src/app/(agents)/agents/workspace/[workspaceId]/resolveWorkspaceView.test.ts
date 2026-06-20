import { describe, expect, it } from "bun:test";
import { resolveWorkspaceView } from "./resolveWorkspaceView";

describe("resolveWorkspaceView (WS-B T4)", () => {
	it("renders live when a real host is requested and access is allowed", () => {
		expect(
			resolveWorkspaceView({
				routingKey: "org-1:machine-1",
				accessAllowed: true,
				hasMock: false,
			}),
		).toEqual({ kind: "live", routingKey: "org-1:machine-1" });
	});

	it("falls back to mock when no host param but a mock session exists", () => {
		expect(
			resolveWorkspaceView({
				routingKey: null,
				accessAllowed: false,
				hasMock: true,
			}),
		).toEqual({ kind: "mock" });
	});

	it("does NOT attach live when the host is requested but access is denied", () => {
		expect(
			resolveWorkspaceView({
				routingKey: "org-1:machine-1",
				accessAllowed: false,
				hasMock: true,
			}),
		).toEqual({ kind: "mock" });
	});

	it("returns notFound when neither a reachable host nor a mock session exists", () => {
		expect(
			resolveWorkspaceView({
				routingKey: "org-1:machine-1",
				accessAllowed: false,
				hasMock: false,
			}),
		).toEqual({ kind: "notFound" });
		expect(
			resolveWorkspaceView({
				routingKey: null,
				accessAllowed: false,
				hasMock: false,
			}),
		).toEqual({ kind: "notFound" });
	});
});
