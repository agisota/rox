import { useBreakpoint } from "./use-breakpoint";

/**
 * `useIsMobile` — backward-compatible boolean over the shared tier core.
 *
 * Historically this hook owned its own single 768px breakpoint. Since F05
 * (Hermes-borrow #639) the viewport tiers live in `@rox/shared/breakpoints`
 * (wide / tablet / phone) and are surfaced through {@link useBreakpoint}; this
 * hook is now a thin alias that reports "is the shell on its touch-first
 * (phone) tier?" so existing callers (e.g. the sidebar) keep working while the
 * shell reads tiers from the one source of truth. Prefer `useBreakpoint` /
 * `useCascadeRules` for new shell code that also needs the tablet tier.
 */
export function useIsMobile(): boolean {
	return useBreakpoint() === "phone";
}
