/**
 * Redacts secret values from arbitrary payloads before they are recorded to
 * run steps, artifacts, logs, or UI. Matches by exact string value of each
 * known secret (recursively through objects/arrays).
 */
export class Redactor {
	private readonly secretValues: string[];
	static readonly MASK = "[REDACTED]";

	constructor(secrets: Record<string, string> = {}) {
		this.secretValues = Object.values(secrets).filter(
			(v) => typeof v === "string" && v.length > 0,
		);
	}

	redact<T>(value: T): T {
		if (this.secretValues.length === 0) return value;
		return this.walk(value) as T;
	}

	private walk(value: unknown): unknown {
		if (typeof value === "string") {
			let out = value;
			for (const secret of this.secretValues) {
				if (out.includes(secret)) out = out.split(secret).join(Redactor.MASK);
			}
			return out;
		}
		if (Array.isArray(value)) return value.map((v) => this.walk(v));
		if (value && typeof value === "object") {
			const result: Record<string, unknown> = {};
			for (const [k, v] of Object.entries(value)) result[k] = this.walk(v);
			return result;
		}
		return value;
	}
}
