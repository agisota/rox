import { describe, expect, it } from "bun:test";
import {
	createAgentSourceSchema,
	updateAgentSourceSchema,
} from "@rox/trpc/agent-source-schema";
import {
	type CredentialRow,
	collapseCredentials,
	initSourceFormState,
	isConnectableSourceKind,
	isHttpsEndpoint,
	type SourceFormState,
	slugifyName,
	toCreateInput,
	toUpdateInput,
	validateSourceForm,
} from "./sourceFormState";

/**
 * Desktop-copy guard for the ported pure mapping. The desktop surface ships its
 * own copy of `sourceFormState.ts` (the web component is not cross-app
 * importable), so this independently pins that the copy still shapes payloads
 * the AUTHORITATIVE cross-platform `agentSource` router schema accepts
 * (`@rox/trpc/agent-source-schema`) — i.e. desktop and web feed the identical
 * contract. If the desktop copy ever drifts from the schema, this fails.
 */

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_ID = "44444444-4444-4444-8444-444444444444";

function baseForm(overrides: Partial<SourceFormState> = {}): SourceFormState {
	return {
		name: "Acme MCP",
		slug: "acme-mcp",
		kind: "mcp",
		endpointUrl: "https://mcp.acme.example/run",
		description: "",
		credentials: [],
		...overrides,
	};
}

describe("isConnectableSourceKind", () => {
	it("accepts the two focused kinds and rejects others", () => {
		expect(isConnectableSourceKind("mcp")).toBe(true);
		expect(isConnectableSourceKind("external_http")).toBe(true);
		expect(isConnectableSourceKind("claude_code")).toBe(false);
		expect(isConnectableSourceKind("nonsense")).toBe(false);
	});
});

describe("slugifyName", () => {
	it("derives a kebab-case slug", () => {
		expect(slugifyName("Claude Code!")).toBe("claude-code");
		expect(slugifyName("  Acme   MCP  ")).toBe("acme-mcp");
	});
});

describe("isHttpsEndpoint", () => {
	it("accepts https and rejects http/empty/garbage", () => {
		expect(isHttpsEndpoint("https://x.example/run")).toBe(true);
		expect(isHttpsEndpoint("http://x.example/run")).toBe(false);
		expect(isHttpsEndpoint("")).toBe(false);
		expect(isHttpsEndpoint("not a url")).toBe(false);
	});
});

describe("collapseCredentials", () => {
	it("drops blank-key rows, trims keys, and lets later rows win", () => {
		const rows: CredentialRow[] = [
			{ key: " Authorization ", value: "Bearer t" },
			{ key: "", value: "ignored" },
		];
		expect(collapseCredentials(rows)).toEqual({ Authorization: "Bearer t" });
		expect(collapseCredentials([])).toBeUndefined();
		expect(
			collapseCredentials([
				{ key: "k", value: "first" },
				{ key: "k", value: "second" },
			]),
		).toEqual({ k: "second" });
	});
});

describe("validateSourceForm", () => {
	it("passes a well-formed mcp source and flags each field error", () => {
		expect(validateSourceForm(baseForm())).toBeNull();
		expect(validateSourceForm(baseForm({ name: "  " }))).toContain("название");
		expect(validateSourceForm(baseForm({ slug: "Acme_MCP" }))).toContain(
			"Slug",
		);
		expect(
			validateSourceForm(baseForm({ endpointUrl: "http://x.example" })),
		).toContain("HTTPS");
	});
});

describe("toCreateInput → createAgentSourceSchema (authoritative contract)", () => {
	it("produces a payload the router schema accepts and sends PLAINTEXT credentials", () => {
		const input = toCreateInput(
			baseForm({
				description: "Acme connector",
				credentials: [{ key: "Authorization", value: "Bearer secret" }],
			}),
			ORG_ID,
		);
		expect(createAgentSourceSchema.safeParse(input).success).toBe(true);
		expect(input.credentials).toEqual({ Authorization: "Bearer secret" });
	});

	it("omits credentials/description when empty so schema optionals apply", () => {
		const input = toCreateInput(baseForm(), ORG_ID);
		expect(input).not.toHaveProperty("credentials");
		expect(input).not.toHaveProperty("description");
		expect(createAgentSourceSchema.safeParse(input).success).toBe(true);
	});

	it("forwards external_http and is rejected by the schema for non-HTTPS", () => {
		const ok = toCreateInput(baseForm({ kind: "external_http" }), ORG_ID);
		expect(ok.kind).toBe("external_http");
		expect(createAgentSourceSchema.safeParse(ok).success).toBe(true);

		const bad = toCreateInput(
			baseForm({ endpointUrl: "http://mcp.acme.example/run" }),
			ORG_ID,
		);
		expect(createAgentSourceSchema.safeParse(bad).success).toBe(false);
	});
});

describe("toUpdateInput → updateAgentSourceSchema (authoritative contract)", () => {
	it("accepts a blank-credential edit (no re-encrypt) and a credential rotation", () => {
		const blank = toUpdateInput(
			baseForm({ name: "Renamed" }),
			SOURCE_ID,
			ORG_ID,
		);
		expect(blank).not.toHaveProperty("credentials");
		expect(blank.description).toBeNull();
		expect(updateAgentSourceSchema.safeParse(blank).success).toBe(true);

		const rotated = toUpdateInput(
			baseForm({ credentials: [{ key: "X-API-Key", value: "rotated" }] }),
			SOURCE_ID,
			ORG_ID,
		);
		expect(rotated.credentials).toEqual({ "X-API-Key": "rotated" });
		expect(updateAgentSourceSchema.safeParse(rotated).success).toBe(true);
	});
});

describe("initSourceFormState", () => {
	it("seeds blank credentials even for an edit (projection hides the secret)", () => {
		const state = initSourceFormState({
			name: "Acme",
			slug: "acme",
			kind: "external_http",
			endpointUrl: "https://acme.example/run",
			description: "desc",
		});
		expect(state.credentials).toEqual([]);
		expect(state.kind).toBe("external_http");
		expect(state.endpointUrl).toBe("https://acme.example/run");
	});
});
