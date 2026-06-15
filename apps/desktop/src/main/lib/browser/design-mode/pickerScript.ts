/**
 * In-page scripts for Design Mode, injected into the guest webview via
 * `WebContents.executeJavaScript`. They run in the isolated guest context (no
 * Node), handle hover highlighting and click selection entirely page-side (no
 * per-frame host roundtrip, no layout shift), and report the click point to the
 * host through a console marker that {@link DesignModeCaptureService} listens for.
 *
 * Keep these as self-contained string builders — they are serialized and sent to
 * another process, so they must not close over anything from this module.
 */

/** Console marker prefix the host watches to learn a selection happened. */
export const DESIGN_SELECT_MARKER = "__ROX_DESIGN_SELECT__";

const PAGE_NAMESPACE = "__ROX_DESIGN__";

/** Installs the hover/click overlay and the `window.__ROX_DESIGN__` controller. */
export function buildEnablePickerScript(): string {
	return `(() => {
  const NS = "${PAGE_NAMESPACE}";
  const MARKER = ${JSON.stringify(DESIGN_SELECT_MARKER)};
  if (window[NS] && window[NS].enabled) return true;

  const highlight = document.createElement("div");
  Object.assign(highlight.style, {
    position: "fixed",
    pointerEvents: "none",
    zIndex: "2147483646",
    border: "1px solid rgba(56,132,255,0.9)",
    background: "rgba(56,132,255,0.16)",
    boxShadow: "0 0 0 1px rgba(255,255,255,0.4)",
    borderRadius: "2px",
    transition: "all 60ms ease-out",
    display: "none",
    top: "0px", left: "0px", width: "0px", height: "0px",
  });
  highlight.setAttribute("data-rox-design-overlay", "");

  const ctrl = {
    enabled: true,
    highlight,
    lastPoint: null,
    setHighlightVisible(visible) {
      highlight.style.display = visible && ctrl.enabled ? "block" : "none";
    },
  };

  const isOwn = (el) => !el || el === highlight || el.hasAttribute("data-rox-design-overlay");
  const isMeaningful = (el) => {
    if (isOwn(el)) return false;
    const tag = el.tagName;
    if (tag === "HTML" || tag === "BODY") return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") return false;
    return true;
  };

  const place = (el) => {
    const r = el.getBoundingClientRect();
    highlight.style.top = r.top + "px";
    highlight.style.left = r.left + "px";
    highlight.style.width = r.width + "px";
    highlight.style.height = r.height + "px";
    ctrl.setHighlightVisible(true);
  };

  const onMove = (e) => {
    if (!ctrl.enabled) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (isMeaningful(el)) place(el);
    else ctrl.setHighlightVisible(false);
  };

  const onClick = (e) => {
    if (!ctrl.enabled) return;
    e.preventDefault();
    e.stopPropagation();
    ctrl.lastPoint = { x: e.clientX, y: e.clientY };
    console.log(MARKER + JSON.stringify(ctrl.lastPoint));
  };

  const onKey = (e) => {
    if (e.key === "Escape" && ctrl.enabled) ctrl.setHighlightVisible(false);
  };

  ctrl.dispose = () => {
    ctrl.enabled = false;
    document.removeEventListener("mousemove", onMove, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKey, true);
    highlight.remove();
    delete window[NS];
  };

  document.addEventListener("mousemove", onMove, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKey, true);
  (document.body || document.documentElement).appendChild(highlight);
  document.documentElement.style.cursor = "crosshair";
  window[NS] = ctrl;
  return true;
})()`;
}

/** Removes the overlay/controller. */
export function buildDisablePickerScript(): string {
	return `(() => {
  const ctrl = window["${PAGE_NAMESPACE}"];
  document.documentElement.style.cursor = "";
  if (ctrl && ctrl.dispose) ctrl.dispose();
  return true;
})()`;
}

/** Hides/shows the highlight overlay (used to keep it out of screenshots). */
export function buildSetHighlightVisibleScript(visible: boolean): string {
	return `(() => {
  const ctrl = window["${PAGE_NAMESPACE}"];
  if (ctrl && ctrl.setHighlightVisible) ctrl.setHighlightVisible(${visible ? "true" : "false"});
  return true;
})()`;
}
