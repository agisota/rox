import { beforeEach, describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { HostReadiness } from "renderer/hooks/useHostReadiness";
import { getHostStatusInlineView } from "./getHostStatusInlineView";

let readiness: HostReadiness = {
	hostReady: false,
	status: "stopped",
	connecting: false,
	connect: () => undefined,
};

mock.module("renderer/hooks/useHostReadiness", () => ({
	useHostReadiness: () => readiness,
}));

const { HostStatusInline } = await import("./HostStatusInline");

describe("getHostStatusInlineView", () => {
	it("marks ready when a host url exists", () => {
		expect(getHostStatusInlineView("stopped", true)).toMatchObject({
			tone: "ready",
			showConnect: false,
		});
	});

	it("marks ready when status is running even without a url", () => {
		expect(getHostStatusInlineView("running", false).tone).toBe("ready");
	});

	it("shows the starting spinner while the host is coming up", () => {
		expect(getHostStatusInlineView("starting", false)).toMatchObject({
			tone: "starting",
			showSpinner: true,
			label: "Поднимаем хост…",
			showConnect: false,
		});
	});

	it("treats an in-flight manual connect as starting", () => {
		expect(getHostStatusInlineView("stopped", false, true).tone).toBe(
			"starting",
		);
	});

	it("offers connect when stopped or unknown", () => {
		expect(getHostStatusInlineView("stopped", false)).toMatchObject({
			tone: "idle",
			label: "Хост не готов",
			showConnect: true,
		});
		expect(getHostStatusInlineView("unknown", false).showConnect).toBe(true);
	});
});

describe("HostStatusInline", () => {
	beforeEach(() => {
		readiness = {
			hostReady: false,
			status: "stopped",
			connecting: false,
			connect: () => undefined,
		};
	});

	it("renders nothing once the host is ready", () => {
		readiness.hostReady = true;
		readiness.status = "running";
		expect(renderToStaticMarkup(<HostStatusInline />)).toBe("");
	});

	it("renders the starting label with a spinner", () => {
		readiness.status = "starting";
		const markup = renderToStaticMarkup(<HostStatusInline />);
		expect(markup).toContain("Поднимаем хост…");
		expect(markup).toContain("animate-spin");
		expect(markup).not.toContain("Подключить");
	});

	it("renders the connect button when the host is not ready", () => {
		const markup = renderToStaticMarkup(<HostStatusInline />);
		expect(markup).toContain("Хост не готов");
		expect(markup).toContain("Подключить");
	});
});
