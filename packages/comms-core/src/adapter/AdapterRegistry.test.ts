import { describe, expect, it } from "bun:test";
import { AdapterRegistry } from "./AdapterRegistry";
import { InAppAdapter } from "./InAppAdapter";
import type { TransportAdapter } from "./TransportAdapter";

const stub = (kind: TransportAdapter["kind"]): TransportAdapter => ({
	kind,
	normalizeInbound: () => {
		throw new Error("unused");
	},
	send: async () => ({ providerId: "p" }),
});

describe("AdapterRegistry", () => {
	it("resolves a registered adapter by transport", () => {
		const inapp = new InAppAdapter();
		const reg = new AdapterRegistry([inapp]);
		expect(reg.get("inapp")).toBe(inapp);
		expect(reg.has("inapp")).toBe(true);
	});

	it("require() throws for an unregistered transport", () => {
		const reg = new AdapterRegistry();
		expect(() => reg.require("xmpp")).toThrow(/xmpp/);
	});

	it("register replaces the adapter for a transport", () => {
		const reg = new AdapterRegistry([stub("email")]);
		const replacement = stub("email");
		reg.register(replacement);
		expect(reg.get("email")).toBe(replacement);
		expect(reg.kinds()).toEqual(["email"]);
	});

	it("lists registered kinds", () => {
		const reg = new AdapterRegistry([new InAppAdapter(), stub("email")]);
		expect(new Set(reg.kinds())).toEqual(new Set(["inapp", "email"]));
	});
});
