import type { CodeViewOptions } from "@pierre/diffs";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { ease, motionDuration } from "renderer/motion/tokens";
import { useShouldAnimate } from "renderer/motion/useMotionPreference";
import {
	getDiffsTheme,
	getDiffViewerStyle,
} from "renderer/screens/main/components/WorkspaceView/utils/code-theme";
import { useSettings } from "renderer/stores/settings";
import { useResolvedTheme, useTerminalTheme } from "renderer/stores/theme";
import type { DiffAnnotationMetadata } from "../useDiffAnnotations";

export function useDiffCodeViewTheme() {
	const diffStyle = useSettings((s) => s.diffStyle);
	const expandUnchanged = useSettings((s) => s.expandUnchanged);
	const activeTheme = useResolvedTheme();
	// Case 082: gate gutter utility transition duration on decorative motion.
	const animate = useShouldAnimate("decorative");
	const gutterDurMs = animate ? Math.round(motionDuration.fast * 1000) : 0;
	const gutterEase = `cubic-bezier(${ease.standard.join(", ")})`;
	const terminalTheme = useTerminalTheme();
	const { data: fontSettings } = useQuery({
		queryKey: ["electron", "settings", "getFontSettings"],
		queryFn: () => electronTrpcClient.settings.getFontSettings.query(),
		staleTime: 30_000,
	});

	const parsedEditorFontSize =
		typeof fontSettings?.editorFontSize === "number"
			? fontSettings.editorFontSize
			: typeof fontSettings?.editorFontSize === "string"
				? Number.parseFloat(fontSettings.editorFontSize)
				: Number.NaN;
	const surfaceBg = terminalTheme?.background ?? "var(--background)";

	const style = useMemo(
		() => ({
			...getDiffViewerStyle(activeTheme, {
				fontFamily: fontSettings?.editorFontFamily ?? undefined,
				fontSize: Number.isFinite(parsedEditorFontSize)
					? parsedEditorFontSize
					: undefined,
			}),
			backgroundColor: surfaceBg,
		}),
		[
			activeTheme,
			fontSettings?.editorFontFamily,
			parsedEditorFontSize,
			surfaceBg,
		],
	);

	const additionColor =
		activeTheme.type === "dark"
			? "var(--color-green-400)"
			: "var(--color-green-700)";
	const deletionColor =
		activeTheme.type === "dark"
			? "var(--color-red-500)"
			: "var(--color-red-700)";

	const options = useMemo<CodeViewOptions<DiffAnnotationMetadata>>(
		() => ({
			diffStyle,
			expandUnchanged,
			overflow: "wrap",
			stickyHeaders: true,
			theme: getDiffsTheme(activeTheme),
			themeType: activeTheme.type,
			layout: {
				paddingTop: 0,
				paddingBottom: 8,
				gap: 0,
			},
			// Degrade gracefully on lockfiles / minified bundles instead of
			// blocking the worker. Pierre's defaults are 100k for whole-file
			// tokenization and unbounded for the rest.
			tokenizeMaxLineLength: 5_000,
			tokenizeMaxLength: 200_000,
			maxLineDiffLength: 5_000,
			unsafeCSS: `
				* { user-select: text; -webkit-user-select: text; }
				/* Query container for slotted PR-comment bubbles
				 * (.diff-comment): lets them size to the visible code
				 * column via 100cqi instead of overflowing the pane. The
				 * cell width comes from the grid, so inline-size
				 * containment doesn't collapse it. */
				[data-line-annotation] {
					container-type: inline-size;
				}
				/* Container query host for the "Viewed" label visibility rule
				 * (see DiffHeaderMetadata: @min-[380px]/diff-header:inline). */
				[data-diffs-header='default'] {
					container-type: inline-size;
					container-name: diff-header;
				}
				/* Drop Pierre's status badge — we render a language-specific
				 * FileIcon in the prefix slot instead. */
				[data-diffs-header='default'] [data-change-icon] {
					display: none;
				}
				[data-diffs-header='default'] [data-additions-count] {
					color: ${additionColor};
				}
				[data-diffs-header='default'] [data-deletions-count] {
					color: ${deletionColor};
				}
				[data-diffs-header='default'] [data-discard-button] {
					opacity: 0;
				}
				[data-diffs-header='default']:hover [data-discard-button],
				[data-diffs-header='default']:focus-within [data-discard-button] {
					opacity: 1;
				}
				/* Pierre sets --diffs-light-bg/--diffs-dark-bg
				 * inline on <pre data-diff> from the Shiki theme;
				 * inline beats :host so we override at the pre. */
				[data-diff] {
					--diffs-light-bg: ${surfaceBg} !important;
					--diffs-dark-bg: ${surfaceBg} !important;
				}
				/* Flatten the "N unmodified lines" strip flush to
				 * the pane edges (kills wrapper/content/expand-
				 * button rounding + inline gap on both
				 * line-info and line-info-basic). */
				[data-separator^='line-info'] [data-separator-wrapper],
				[data-separator^='line-info'] [data-separator-content],
				[data-separator^='line-info'] [data-expand-up],
				[data-separator^='line-info'] [data-expand-down],
				[data-separator^='line-info'] [data-expand-both] {
					border-radius: 0 !important;
					margin-inline: 0 !important;
					padding-inline: 0 !important;
				}
				/* Case 082: gutter utility (+) hover affordance.
				 * Reserve space (opacity+transform only) so code columns never shift.
				 * Duration is 0 when decorative motion is off → instant reveal. */
				[data-line] [data-gutter-utility] {
					opacity: 0;
					transform: translateX(-2px);
					transition: opacity ${gutterDurMs}ms ${gutterEase}, transform ${gutterDurMs}ms ${gutterEase};
					will-change: opacity, transform;
				}
				[data-line]:hover [data-gutter-utility],
				[data-line]:focus-within [data-gutter-utility],
				[data-gutter-utility]:focus-visible {
					opacity: 1;
					transform: translateX(0);
				}
				${
					animate
						? `
				/* Case 084: one-shot changed-line flash when a new diff mounts.
				 * Scoped to .odw-diff-flash (applied transiently by useDiffFlash)
				 * so virtualized rows scrolled in later do NOT re-flash. */
				@keyframes odwLineFlash {
					from { background-color: color-mix(in srgb, ${additionColor} 22%, transparent); }
					to { background-color: transparent; }
				}
				@keyframes odwLineFlashDel {
					from { background-color: color-mix(in srgb, ${deletionColor} 22%, transparent); }
					to { background-color: transparent; }
				}
				.odw-diff-flash [data-line-type=change-addition] {
					animation: odwLineFlash 600ms ease-out 1 both;
				}
				.odw-diff-flash [data-line-type=change-deletion] {
					animation: odwLineFlashDel 600ms ease-out 1 both;
				}
				`
						: ""
				}
			`,
		}),
		[
			activeTheme,
			additionColor,
			animate,
			deletionColor,
			diffStyle,
			expandUnchanged,
			gutterDurMs,
			gutterEase,
			surfaceBg,
		],
	);

	return { options, style };
}
