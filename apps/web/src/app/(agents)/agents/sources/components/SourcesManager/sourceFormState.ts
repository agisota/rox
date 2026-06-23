import { type AgentSourceKind, agentSourceKindValues } from "@rox/db/enums";

/**
 * Pure form-state ↔ tRPC-input mapping for the connect-a-source surface. Kept in
 * a dependency-free (no React, no tRPC client) module so the create/update
 * payload shaping — the seam most likely to drift from the
 * `createAgentSourceSchema` / `updateAgentSourceSchema` contracts — is
 * unit-testable in isolation.
 *
 * The credential map is modelled as an ordered list of `{ key, value }` rows
 * (what the form renders) and collapsed into the `Record<string,string>` the
 * router AES-encrypts. We NEVER hold or echo `encryptedConfig` here: the form
 * only ever sends PLAINTEXT credentials up; the router encrypts them and the
 * `publicSelect` projection omits the ciphertext on the way back.
 */

/** Kinds the connect MVP focuses on (the two HTTPS/transport-backed kinds). */
export const CONNECTABLE_SOURCE_KINDS = ["mcp", "external_http"] as const;
export type ConnectableSourceKind = (typeof CONNECTABLE_SOURCE_KINDS)[number];

export function isConnectableSourceKind(
	value: string,
): value is ConnectableSourceKind {
	return (CONNECTABLE_SOURCE_KINDS as readonly string[]).includes(value);
}

/** A single editable credential header/value row in the form. */
export interface CredentialRow {
	key: string;
	value: string;
}

/** The raw, in-progress form state the UI binds to. */
export interface SourceFormState {
	name: string;
	slug: string;
	kind: AgentSourceKind;
	endpointUrl: string;
	description: string;
	credentials: CredentialRow[];
}

export interface SourceFormInit {
	name?: string;
	slug?: string;
	kind?: AgentSourceKind;
	endpointUrl?: string | null;
	description?: string | null;
}

/**
 * Seed form state for create (no init) or edit (existing public row). Credentials
 * are ALWAYS seeded empty even when editing: the `list`/`get` projection never
 * returns the stored secret, so the edit form starts blank and only re-sends (and
 * re-encrypts) credentials the user re-enters. Leaving them blank on update keeps
 * the existing encrypted blob untouched (the router only re-encrypts when
 * `credentials` is supplied).
 */
export function initSourceFormState(init?: SourceFormInit): SourceFormState {
	return {
		name: init?.name ?? "",
		slug: init?.slug ?? "",
		kind: init?.kind ?? "mcp",
		endpointUrl: init?.endpointUrl ?? "",
		description: init?.description ?? "",
		credentials: [],
	};
}

/** Auto-derive a kebab-case slug from a display name (form convenience). */
export function slugifyName(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

const SLUG_RE = /^[a-z0-9-]+$/;
const MAX_ENDPOINT_LENGTH = 2048;

/** Is the endpoint a well-formed HTTPS URL? Mirrors `httpsEndpointUrlSchema`. */
export function isHttpsEndpoint(value: string): boolean {
	if (value.length === 0 || value.length > MAX_ENDPOINT_LENGTH) return false;
	try {
		return new URL(value).protocol === "https:";
	} catch {
		return false;
	}
}

/**
 * Collapse the credential rows into the plaintext `Record<string,string>` the
 * router encrypts. Blank-key rows are dropped (a row the user started but left
 * empty), and later rows win on duplicate keys. Returns `undefined` when no
 * usable credentials remain so the caller omits the field entirely (so an
 * update does not clobber an existing encrypted blob with an empty map).
 */
export function collapseCredentials(
	rows: CredentialRow[],
): Record<string, string> | undefined {
	const map: Record<string, string> = {};
	for (const { key, value } of rows) {
		const trimmedKey = key.trim();
		if (trimmedKey.length === 0) continue;
		map[trimmedKey] = value;
	}
	return Object.keys(map).length > 0 ? map : undefined;
}

/** First human-readable validation error, or null when the form is submittable. */
export function validateSourceForm(state: SourceFormState): string | null {
	if (state.name.trim().length === 0) return "Введите название источника.";
	if (state.name.trim().length > 120)
		return "Название не длиннее 120 символов.";
	if (!SLUG_RE.test(state.slug))
		return "Slug: строчные латинские буквы, цифры и «-».";
	if (state.slug.length > 80) return "Slug не длиннее 80 символов.";
	// Both connectable kinds (mcp / external_http) are transport-backed and need a
	// reachable HTTPS endpoint; the runtime pool rejects non-HTTPS at connect time
	// and the router schema rejects it on write, so block it here for fast feedback.
	if (!isHttpsEndpoint(state.endpointUrl))
		return "Укажите HTTPS-адрес эндпоинта (https://…).";
	if (state.description.trim().length > 2000)
		return "Описание не длиннее 2000 символов.";
	return null;
}

/** Input shape accepted by `trpc.agentSource.create`. */
export interface CreateSourceInput {
	organizationId: string;
	v2ProjectId?: string;
	name: string;
	slug: string;
	kind: AgentSourceKind;
	endpointUrl?: string;
	description?: string;
	credentials?: Record<string, string>;
}

/** Input shape accepted by `trpc.agentSource.update`. */
export interface UpdateSourceInput {
	id: string;
	organizationId: string;
	name: string;
	slug: string;
	kind: AgentSourceKind;
	endpointUrl: string;
	description: string | null;
	credentials?: Record<string, string>;
}

/**
 * Map validated form state to the `agentSource.create` input. Only PLAINTEXT
 * credentials are sent; the router encrypts them into `encryptedConfig`. Optional
 * fields are omitted when empty so the schema's `.optional()` defaults apply.
 */
export function toCreateInput(
	state: SourceFormState,
	organizationId: string,
	v2ProjectId?: string,
): CreateSourceInput {
	const credentials = collapseCredentials(state.credentials);
	const description = state.description.trim();
	return {
		organizationId,
		...(v2ProjectId ? { v2ProjectId } : {}),
		name: state.name.trim(),
		slug: state.slug,
		kind: state.kind,
		endpointUrl: state.endpointUrl,
		...(description ? { description } : {}),
		...(credentials ? { credentials } : {}),
	};
}

/**
 * Map validated form state to the `agentSource.update` input. Credentials are
 * sent ONLY when the user entered at least one row, so an edit that leaves the
 * credential rows blank preserves the existing encrypted blob (the router
 * re-encrypts only when `credentials` is present). `description` is nullable on
 * update so clearing it actually clears the column.
 */
export function toUpdateInput(
	state: SourceFormState,
	id: string,
	organizationId: string,
): UpdateSourceInput {
	const credentials = collapseCredentials(state.credentials);
	const description = state.description.trim();
	return {
		id,
		organizationId,
		name: state.name.trim(),
		slug: state.slug,
		kind: state.kind,
		endpointUrl: state.endpointUrl,
		description: description.length > 0 ? description : null,
		...(credentials ? { credentials } : {}),
	};
}

/** All kinds, for completeness in any future full picker. */
export const ALL_SOURCE_KINDS = agentSourceKindValues;
