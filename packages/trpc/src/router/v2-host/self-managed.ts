import type { V2HostProvider, V2ManagedHostKind } from "@rox/db/enums";

export const DEFAULT_SELF_MANAGED_SANDBOX_TTL_MS = 60 * 60 * 1000;

export const SELF_MANAGED_HOST_PROTOCOLS = ["http", "https"] as const;
export type SelfManagedHostProtocol =
	(typeof SELF_MANAGED_HOST_PROTOCOLS)[number];

export interface BuildSelfManagedHostValuesInput {
	name: string;
	host: string;
	port: number;
	protocol: string;
	kind: V2ManagedHostKind;
	ttlMs?: number;
	now?: Date;
}

export interface SelfManagedHostValues {
	machineId: string;
	name: string;
	kind: V2ManagedHostKind;
	provider: V2HostProvider;
	port: number;
	protocol: SelfManagedHostProtocol;
	expiresAt: Date | null;
}

function normalizeHost(value: string): string {
	const trimmed = value.trim();
	if (!trimmed) throw new Error("Host cannot be empty");

	try {
		const parsed = new URL(trimmed);
		if (!parsed.hostname) throw new Error("Host cannot be empty");
		return parsed.hostname.toLowerCase();
	} catch {
		try {
			const parsed = new URL(`http://${trimmed}`);
			return parsed.hostname.toLowerCase();
		} catch {
			return trimmed.replace(/\/+$/, "").toLowerCase();
		}
	}
}

function normalizeProtocol(value: string): SelfManagedHostProtocol {
	const protocol = value.trim().toLowerCase().replace(/:$/, "");
	if (protocol === "http" || protocol === "https") return protocol;
	throw new Error(`Unsupported host protocol: ${value}`);
}

export function buildSelfManagedHostValues(
	input: BuildSelfManagedHostValuesInput,
): SelfManagedHostValues {
	const ttlMs =
		input.kind === "sandbox"
			? (input.ttlMs ?? DEFAULT_SELF_MANAGED_SANDBOX_TTL_MS)
			: undefined;
	const now = input.now ?? new Date();

	return {
		machineId: normalizeHost(input.host),
		name: input.name.trim(),
		kind: input.kind,
		provider: "self",
		port: input.port,
		protocol: normalizeProtocol(input.protocol),
		expiresAt: ttlMs === undefined ? null : new Date(now.getTime() + ttlMs),
	};
}
