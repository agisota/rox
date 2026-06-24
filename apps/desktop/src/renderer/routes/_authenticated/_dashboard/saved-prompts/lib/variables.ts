/**
 * Prompt variable grammar + renderer (pure, framework-agnostic).
 *
 * Supports a documented subset of the Raycast Dynamic Placeholders / Espanso
 * syntax (spec-only borrow — no code copied):
 *   {{name}}                     text field
 *   {{name=default text}}        text field with a default value
 *   {{name|upper}} / |lower /    inline transform applied at render
 *     |trim |capitalize
 *   {{name:long}}                long (textarea) field
 *   {{name:select(a,b,c)}}       select field with options a|b|c
 *   {{name:select(a,b)=b}}       select with a default option
 *   {cursor}                     caret placement marker (consumed on insert)
 *
 * The same parser feeds the editor's «Обнаруженные переменные» readout, the
 * fill form, and the inserter so all three agree on names and types.
 */

export type VariableType = "text" | "long" | "select";

export type VariableTransform = "upper" | "lower" | "trim" | "capitalize";

export interface PromptVariable {
	/** Canonical variable name (the form-field key). */
	name: string;
	/** Human label for the field — the name as written. */
	label: string;
	type: VariableType;
	/** Default value/option, if the grammar supplied one. */
	defaultValue: string;
	/** Options for a select variable. */
	options: string[];
}

/** Marker the editor/inserter use to place the caret. */
export const CURSOR_TOKEN = "{cursor}";

// {{ ... }} — non-greedy, no nested braces. Capture the inner spec.
const TOKEN_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;

const TRANSFORMS: ReadonlySet<string> = new Set([
	"upper",
	"lower",
	"trim",
	"capitalize",
]);

function applyTransform(value: string, transform: VariableTransform): string {
	switch (transform) {
		case "upper":
			return value.toUpperCase();
		case "lower":
			return value.toLowerCase();
		case "trim":
			return value.trim();
		case "capitalize":
			return value.length === 0
				? value
				: value[0].toUpperCase() + value.slice(1);
	}
}

interface ParsedSpec {
	name: string;
	type: VariableType;
	defaultValue: string;
	options: string[];
	transform: VariableTransform | null;
}

/** Parse one inner token spec like `name:select(a,b)=b|upper`. */
function parseSpec(raw: string): ParsedSpec | null {
	let work = raw.trim();
	if (work.length === 0) return null;

	// Trailing transform: `...|upper`. Only split on the LAST pipe so option
	// lists with their own separators are unaffected (we use commas for those).
	let transform: VariableTransform | null = null;
	const pipeIndex = work.lastIndexOf("|");
	if (pipeIndex !== -1) {
		const candidate = work
			.slice(pipeIndex + 1)
			.trim()
			.toLowerCase();
		if (TRANSFORMS.has(candidate)) {
			transform = candidate as VariableTransform;
			work = work.slice(0, pipeIndex).trim();
		}
	}

	// Default value: `...=default`. Split on the FIRST `=` after the name part.
	let defaultValue = "";
	const eqIndex = work.indexOf("=");
	if (eqIndex !== -1) {
		defaultValue = work.slice(eqIndex + 1).trim();
		work = work.slice(0, eqIndex).trim();
	}

	// Type modifier: `name:long` or `name:select(a,b,c)`.
	let type: VariableType = "text";
	let options: string[] = [];
	const colonIndex = work.indexOf(":");
	let name = work;
	if (colonIndex !== -1) {
		name = work.slice(0, colonIndex).trim();
		const modifier = work.slice(colonIndex + 1).trim();
		const selectMatch = modifier.match(/^select\s*\(([^)]*)\)$/i);
		if (selectMatch) {
			type = "select";
			options = selectMatch[1]
				.split(",")
				.map((opt) => opt.trim())
				.filter((opt) => opt.length > 0);
		} else if (modifier.toLowerCase() === "long") {
			type = "long";
		}
	}

	name = name.trim();
	if (name.length === 0) return null;
	return { name, type, defaultValue, options, transform };
}

/**
 * Extract every unique variable (first-seen order). A name that appears with
 * conflicting modifiers keeps its FIRST definition; later occurrences are
 * rendered with the same field's value.
 */
export function parseVariables(body: string): PromptVariable[] {
	const byName = new Map<string, PromptVariable>();
	TOKEN_RE.lastIndex = 0;
	let match: RegExpExecArray | null = TOKEN_RE.exec(body);
	while (match !== null) {
		const spec = parseSpec(match[1]);
		if (spec && !byName.has(spec.name)) {
			byName.set(spec.name, {
				name: spec.name,
				label: spec.name,
				type: spec.type,
				defaultValue: spec.defaultValue,
				options:
					spec.type === "select" && spec.defaultValue.length > 0
						? Array.from(new Set([...spec.options, spec.defaultValue]))
						: spec.options,
			});
		}
		match = TOKEN_RE.exec(body);
	}
	return Array.from(byName.values());
}

/** Just the unique variable names (cheap; used for the badge + decode). */
export function parseVariableNames(body: string): string[] {
	return parseVariables(body).map((v) => v.name);
}

/** Does the body contain at least one variable token? */
export function hasVariables(body: string): boolean {
	TOKEN_RE.lastIndex = 0;
	return TOKEN_RE.test(body);
}

export interface RenderResult {
	/** Body with every token replaced and `{cursor}` removed. */
	text: string;
	/** Caret offset where `{cursor}` was (or null if absent). */
	cursor: number | null;
}

/**
 * Replace each `{{token}}` with its filled value (applying any transform), and
 * resolve `{cursor}` to a caret offset. Missing values fall back to the default
 * then to the original token text so the prompt is never silently truncated.
 */
export function renderPrompt(
	body: string,
	values: Record<string, string>,
): RenderResult {
	const replaced = body.replace(TOKEN_RE, (whole, inner: string) => {
		const spec = parseSpec(inner);
		if (!spec) return whole;
		const provided = values[spec.name];
		const value =
			provided !== undefined && provided !== "" ? provided : spec.defaultValue;
		if (value === "" && provided === undefined) {
			// No value and no default — keep the visible token so the user notices.
			return whole;
		}
		return spec.transform ? applyTransform(value, spec.transform) : value;
	});

	const cursorIndex = replaced.indexOf(CURSOR_TOKEN);
	if (cursorIndex === -1) {
		return { text: replaced, cursor: null };
	}
	const text =
		replaced.slice(0, cursorIndex) +
		replaced.slice(cursorIndex + CURSOR_TOKEN.length);
	return { text, cursor: cursorIndex };
}

/** Initial form values: prefer cached, then grammar default, else empty. */
export function initialVariableValues(
	variables: readonly PromptVariable[],
	cached: Record<string, string> | undefined,
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const variable of variables) {
		const cachedValue = cached?.[variable.name];
		out[variable.name] =
			cachedValue !== undefined && cachedValue !== ""
				? cachedValue
				: variable.defaultValue;
	}
	return out;
}
