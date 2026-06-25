import type { BlockHandler, BlockHandlerContext } from "../executor/types";

/**
 * Pure `manual_input` handler (#547): an entry node (like `start`) that forwards
 * the run's top-level `runInput` into the graph, but shaped by the node's typed
 * field declaration. The author declares `subBlocks.fields` as a map of field
 * name → type (`string`/`number`/`boolean`/`json`); each declared field is read
 * from `runInput`, coerced to its declared type, and emitted on `out`.
 *
 * When no `fields` are declared the whole `runInput` is forwarded verbatim (the
 * `start`-equivalent pass-through), so a manual_input node with an empty form
 * behaves exactly like the legacy entry point. Type-only imports against the
 * runtime barrel keep the `./handlers` subpath import-cycle-safe.
 */

type FieldType = "string" | "number" | "boolean" | "json";

function asString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

/**
 * Normalize the authored `subBlocks.fields` (name → type) into a typed map,
 * dropping entries without a recognized type so a malformed declaration can't
 * coerce a value to an unknown type.
 */
export function parseManualInputFields(
	raw: unknown,
): Record<string, FieldType> {
	if (raw == null || typeof raw !== "object") return {};
	const out: Record<string, FieldType> = {};
	for (const [name, typeRaw] of Object.entries(
		raw as Record<string, unknown>,
	)) {
		const type = asString(typeRaw);
		if (
			type === "string" ||
			type === "number" ||
			type === "boolean" ||
			type === "json"
		) {
			out[name] = type;
		}
	}
	return out;
}

/**
 * Coerce a raw `runInput` value to a declared field type. Best-effort and
 * lossless-on-match: a value already of the target type passes through; strings
 * are parsed for number/boolean/json. An uncoercible value yields `undefined`
 * (the field is reported as absent rather than the wrong type).
 */
export function coerceField(value: unknown, type: FieldType): unknown {
	switch (type) {
		case "string":
			return typeof value === "string" ? value : asJsonString(value);
		case "number": {
			if (typeof value === "number")
				return Number.isFinite(value) ? value : undefined;
			if (typeof value === "string" && value.trim() !== "") {
				const n = Number(value);
				return Number.isFinite(n) ? n : undefined;
			}
			return undefined;
		}
		case "boolean": {
			if (typeof value === "boolean") return value;
			if (typeof value === "string") {
				const lower = value.trim().toLowerCase();
				if (lower === "true") return true;
				if (lower === "false") return false;
			}
			return undefined;
		}
		case "json": {
			if (typeof value !== "string") return value;
			try {
				return JSON.parse(value);
			} catch {
				return undefined;
			}
		}
	}
}

function asJsonString(value: unknown): string | undefined {
	if (value == null) return undefined;
	return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Build the `manual_input` block handler. Reads `subBlocks.fields`; with no
 * declared fields it forwards the entire `runInput` (start-equivalent). With
 * declared fields, each is read from `runInput`, coerced to its declared type,
 * and emitted on `out` (fields absent or uncoercible from `runInput` are
 * omitted). Pure: no port, no DB, no secrets.
 */
export function makeManualInputHandler(): BlockHandler {
	return (ctx: BlockHandlerContext) => {
		const sub = ctx.block.subBlocks ?? {};
		const fields = parseManualInputFields(sub.fields);
		const names = Object.keys(fields);

		// No typed form → forward the whole run input (start-equivalent entry node).
		if (names.length === 0) {
			return { handle: "out", output: { ...ctx.runInput } };
		}

		const output: Record<string, unknown> = {};
		for (const name of names) {
			const coerced = coerceField(
				ctx.runInput[name],
				fields[name] as FieldType,
			);
			if (coerced !== undefined) output[name] = coerced;
		}
		return { handle: "out", output };
	};
}
