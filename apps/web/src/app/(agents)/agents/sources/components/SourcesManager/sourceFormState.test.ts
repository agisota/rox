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
	it("accepts the two focused kinds", () => {
		expect(isConnectableSourceKind("mcp")).toBe(true);
		expect(isConnectableSourceKind("external_http")).toBe(true);
	});
	it("rejects other kinds", () => {
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
	it("accepts https", () => {
		expect(isHttpsEndpoint("https://x.example/run")).toBe(true);
	});
	it("rejects http / empty / garbage", () => {
		expect(isHttpsEndpoint("http://x.example/run")).toBe(false);
		expect(isHttpsEndpoint("")).toBe(false);
		expect(isHttpsEndpoint("not a url")).toBe(false);
	});
});

describe("collapseCredentials", () => {
	it("drops blank-key rows and trims keys", () => {
		const rows: CredentialRow[] = [
			{ key: " Authorization ", value: "Bearer t" },
			{ key: "", value: "ignored" },
		];
		expect(collapseCredentials(rows)).toEqual({ Authorization: "Bearer t" });
	});
	it("returns undefined when there are no usable rows", () => {
		expect(collapseCredentials([])).toBeUndefined();
		expect(collapseCredentials([{ key: "  ", value: "x" }])).toBeUndefined();
	});
	it("lets later rows win on duplicate keys", () => {
		expect(
			collapseCredentials([
				{ key: "k", value: "first" },
				{ key: "k", value: "second" },
			]),
		).toEqual({ k: "second" });
	});
});

describe("validateSourceForm", () => {
	it("passes a well-formed mcp source", () => {
		expect(validateSourceForm(baseForm())).toBeNull();
	});
	it("requires a name", () => {
		expect(validateSourceForm(baseForm({ name: "  " }))).toContain("название");
	});
	it("rejects a non-kebab slug", () => {
		expect(validateSourceForm(baseForm({ slug: "Acme_MCP" }))).toContain(
			"Slug",
		);
	});
	it("requires an HTTPS endpoint", () => {
		expect(
			validateSourceForm(baseForm({ endpointUrl: "http://x.example" })),
		).toContain("HTTPS");
	});
});

describe("toCreateInput → createAgentSourceSchema", () => {
	it("produces a payload the router schema accepts", () => {
		const input = toCreateInput(
			baseForm({
				description: "Acme connector",
				credentials: [{ key: "Authorization", value: "Bearer secret" }],
			}),
			ORG_ID,
		);
		const parsed = createAgentSourceSchema.safeParse(input);
		expect(parsed.success).toBe(true);
		// PLAINTEXT credentials are sent up; the router encrypts them. The form
		// never holds ciphertext.
		expect(input.credentials).toEqual({ Authorization: "Bearer secret" });
	});

	it("omits credentials/description when empty so schema optionals apply", () => {
		const input = toCreateInput(baseForm(), ORG_ID);
		expect(input).not.toHaveProperty("credentials");
		expect(input).not.toHaveProperty("description");
		expect(createAgentSourceSchema.safeParse(input).success).toBe(true);
	});

	it("forwards external_http kind", () => {
		const input = toCreateInput(baseForm({ kind: "external_http" }), ORG_ID);
		expect(input.kind).toBe("external_http");
		expect(createAgentSourceSchema.safeParse(input).success).toBe(true);
	});

	it("is rejected by the schema when the endpoint is not HTTPS", () => {
		// The mapping forwards whatever endpoint it is given; the schema is the
		// authoritative gate, so a non-HTTPS endpoint must fail validation.
		const input = toCreateInput(
			baseForm({ endpointUrl: "http://mcp.acme.example/run" }),
			ORG_ID,
		);
		expect(createAgentSourceSchema.safeParse(input).success).toBe(false);
	});
});

describe("toUpdateInput → updateAgentSourceSchema", () => {
	it("produces a payload the router schema accepts and sends no credentials when blank", () => {
		const input = toUpdateInput(
			baseForm({ name: "Renamed" }),
			SOURCE_ID,
			ORG_ID,
		);
		expect(input).not.toHaveProperty("credentials");
		expect(input.description).toBeNull();
		expect(updateAgentSourceSchema.safeParse(input).success).toBe(true);
	});

	it("re-sends credentials only when the user entered rows", () => {
		const input = toUpdateInput(
			baseForm({ credentials: [{ key: "X-API-Key", value: "rotated" }] }),
			SOURCE_ID,
			ORG_ID,
		);
		expect(input.credentials).toEqual({ "X-API-Key": "rotated" });
		expect(updateAgentSourceSchema.safeParse(input).success).toBe(true);
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
