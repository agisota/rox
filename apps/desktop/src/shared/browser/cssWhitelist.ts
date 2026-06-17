/**
 * Computed-style allowlist. Design Mode must never ship the full computed style
 * map to the agent (hundreds of properties, plus potential leakage). We keep the
 * properties that matter for layout/visual fixes, per spec §7.3.
 */
export const CSS_WHITELIST: readonly string[] = Object.freeze([
	// typography
	"font-family",
	"font-size",
	"font-weight",
	"font-style",
	"line-height",
	"letter-spacing",
	"text-align",
	"text-transform",
	"text-decoration",
	"white-space",
	"text-overflow",
	// color — note: `background`/`background-image` are intentionally excluded
	// so signed URLs / data URIs in background images can't leak to the agent.
	"color",
	"background-color",
	"opacity",
	// spacing
	"margin",
	"margin-top",
	"margin-right",
	"margin-bottom",
	"margin-left",
	"padding",
	"padding-top",
	"padding-right",
	"padding-bottom",
	"padding-left",
	"gap",
	"row-gap",
	"column-gap",
	// sizing
	"width",
	"height",
	"min-width",
	"min-height",
	"max-width",
	"max-height",
	"box-sizing",
	"overflow",
	"overflow-x",
	"overflow-y",
	// border
	"border",
	"border-width",
	"border-style",
	"border-color",
	"border-radius",
	"box-shadow",
	"outline",
	// layout
	"display",
	"position",
	"top",
	"right",
	"bottom",
	"left",
	"z-index",
	"float",
	"clear",
	"visibility",
	// flex / grid
	"flex",
	"flex-direction",
	"flex-wrap",
	"flex-grow",
	"flex-shrink",
	"flex-basis",
	"align-items",
	"align-content",
	"align-self",
	"justify-content",
	"justify-items",
	"justify-self",
	"order",
	"grid",
	"grid-template-columns",
	"grid-template-rows",
	"grid-template-areas",
	"grid-column",
	"grid-row",
	"grid-area",
	"grid-auto-flow",
	// effects
	"transform",
	"transform-origin",
	"transition",
	"animation",
	"cursor",
	"pointer-events",
]);

const WHITELIST_SET = new Set(CSS_WHITELIST);

// Properties whose `"none"` value is non-initial and meaningful for the agent
// (e.g. `pointer-events: none`, `display: none`), so it must survive filtering.
const NONE_IS_MEANINGFUL = new Set(["display", "pointer-events"]);

/**
 * Filters a raw computed-style map down to the allowlist. Empty/initial noise
 * values (`""`, `"normal"`, and a default `"none"`) are dropped to keep the
 * payload tight and readable, except where `"none"` carries real meaning.
 */
export function filterComputedStyles(
	computed: Record<string, string>,
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const prop of CSS_WHITELIST) {
		const value = computed[prop];
		if (value == null) continue;
		const trimmed = value.trim();
		if (trimmed === "" || trimmed === "normal") continue;
		if (trimmed === "none" && !NONE_IS_MEANINGFUL.has(prop)) continue;
		out[prop] = trimmed;
	}
	return out;
}

export function isWhitelistedCssProperty(prop: string): boolean {
	return WHITELIST_SET.has(prop);
}
