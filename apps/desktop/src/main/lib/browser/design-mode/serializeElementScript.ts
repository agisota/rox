/**
 * Builds the one-shot in-page serialization script run via
 * `WebContents.executeJavaScript` after a Design Mode selection. It returns a
 * {@link RawElementDescriptor}-shaped object for the element at (x, y).
 *
 * Security: it only reads DOM structure + a whitelisted subset of computed
 * styles. It never touches cookies, storage, or auth state (spec §10.2/§10.7).
 */
export function buildSerializeElementScript(opts: {
	x: number;
	y: number;
	cssWhitelist: readonly string[];
	maxOuterHtml: number;
}): string {
	const { x, y, cssWhitelist, maxOuterHtml } = opts;
	return `(() => {
  const WHITELIST = ${JSON.stringify(cssWhitelist)};
  const MAX_HTML = ${Math.max(1024, Math.floor(maxOuterHtml))};
  const cap = (s) => (s == null ? "" : s.length > MAX_HTML ? s.slice(0, MAX_HTML) + "\\u2026" : s);

  const ctrl = window["__ROX_DESIGN__"];
  if (ctrl && ctrl.setHighlightVisible) ctrl.setHighlightVisible(false);

  let el = document.elementFromPoint(${x}, ${y});
  while (el && (el === (ctrl && ctrl.highlight) || (el.hasAttribute && el.hasAttribute("data-rox-design-overlay")))) {
    el = el.parentElement;
  }
  if (!el || el.tagName === "HTML") el = document.body;
  if (!el) return null;

  const rect = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  const computedStyles = {};
  for (const prop of WHITELIST) {
    const v = cs.getPropertyValue(prop);
    if (v) computedStyles[prop] = v;
  }

  const attributes = {};
  const MAX_ATTRIBUTES = 64;
  const MAX_ATTRIBUTE_VALUE = 2048;
  for (const a of Array.from(el.attributes || [])) {
    if (a.name === "data-rox-design-overlay") continue;
    if (Object.keys(attributes).length >= MAX_ATTRIBUTES) break;
    // Cap per-attribute size so a huge data-* value can't bloat the IPC payload.
    attributes[a.name] = String(a.value).slice(0, MAX_ATTRIBUTE_VALUE);
  }

  const testId = el.getAttribute("data-testid") || el.getAttribute("data-test-id") || el.getAttribute("data-cy") || undefined;
  const role = el.getAttribute("role") || undefined;
  const ariaLabel = el.getAttribute("aria-label") || undefined;

  // Root-first indexed DOM path (nth-of-type per segment).
  const path = [];
  let node = el;
  while (node && node.nodeType === 1 && node.tagName !== "HTML") {
    let index = 1;
    let sib = node.previousElementSibling;
    while (sib) {
      if (sib.tagName === node.tagName) index++;
      sib = sib.previousElementSibling;
    }
    path.unshift({ tagName: node.tagName, index });
    node = node.parentElement;
  }

  // Best-effort source hint from common dev-tooling attributes.
  let sourceHint;
  const vinspect = el.getAttribute("data-v-inspector") || el.getAttribute("data-inspector-relative-path");
  if (vinspect) {
    const m = String(vinspect).match(/^(.*?):(\\d+):(\\d+)$/);
    if (m) sourceHint = { filePath: m[1], line: Number(m[2]), column: Number(m[3]) };
    else sourceHint = { filePath: String(vinspect) };
  } else if (el.getAttribute("data-source")) {
    sourceHint = { filePath: el.getAttribute("data-source") };
  }

  const text = (el.textContent || "").replace(/\\s+/g, " ").trim();

  return {
    tagName: el.tagName,
    id: el.id || undefined,
    classList: Array.from(el.classList || []),
    attributes,
    testId,
    role,
    ariaLabel,
    outerHTML: cap(el.outerHTML),
    parentOuterHTML: el.parentElement ? cap(el.parentElement.outerHTML) : undefined,
    nearbyText: el.parentElement ? (el.parentElement.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 400) : undefined,
    textSnippet: text.slice(0, 200),
    computedStyles,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    viewport: { width: window.innerWidth, height: window.innerHeight, devicePixelRatio: window.devicePixelRatio || 1 },
    domPath: path,
    sourceHint,
  };
})()`;
}
