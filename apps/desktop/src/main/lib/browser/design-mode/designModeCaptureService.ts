import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	base64ByteSize,
	buildSelectorHints,
	CSS_WHITELIST,
	computeCropRect,
	type DesignModeCapture,
	type DesignModeEvent,
	filterComputedStyles,
	inferFramework,
	isScreenshotWithinLimit,
	MAX_HTML_BYTES,
	normalizeSourcePath,
	rawElementDescriptorSchema,
	toCaptureBounds,
	truncateHtml,
} from "shared/browser";
import { browserManager } from "../browser-manager";
import {
	buildDisablePickerScript,
	buildEnablePickerScript,
	buildSetHighlightVisibleScript,
	DESIGN_SELECT_MARKER,
} from "./pickerScript";
import { buildSerializeElementScript } from "./serializeElementScript";

const MAX_STORED_CAPTURES = 50;
const CAPTURE_DIR_NAME = ".rox/design-captures";

type ConsoleEntry = { level: string; message: string; timestamp: number };

/**
 * Drives Design Mode for browser panes: injects the picker, relays selection
 * events to the renderer (via the router's observable), and produces a
 * {@link DesignModeCapture} on demand. Logs only ids/sizes — never payloads
 * (spec §12).
 */
class DesignModeCaptureService extends EventEmitter {
	private enabledPanes = new Set<string>();
	private markerListeners = new Map<string, (entry: ConsoleEntry) => void>();
	private navCleanups = new Map<string, () => void>();
	private nonces = new Map<string, string>();
	private captures = new Map<string, DesignModeCapture>();
	private captureOrder: string[] = [];
	// Per-pane capture queue. Captures hide the picker overlay, screenshot, then
	// restore it; serializing per pane stops concurrent captures from interleaving
	// that hide/show and leaking the overlay into a screenshot.
	private captureChains = new Map<string, Promise<unknown>>();

	async setDesignMode(paneId: string, enabled: boolean): Promise<void> {
		if (enabled) await this.enable(paneId);
		else await this.disable(paneId);
	}

	isEnabled(paneId: string): boolean {
		return this.enabledPanes.has(paneId);
	}

	private async enable(paneId: string): Promise<void> {
		if (this.enabledPanes.has(paneId)) return;

		// Per-session nonce: lives only in the injected script closure, so guest
		// scripts can't forge a valid selection marker.
		const nonce = randomUUID().replace(/-/g, "");
		this.nonces.set(paneId, nonce);
		await browserManager.evaluateJS(paneId, buildEnablePickerScript(nonce));
		this.enabledPanes.add(paneId);

		const listener = (entry: ConsoleEntry) => {
			if (!entry.message?.startsWith(DESIGN_SELECT_MARKER)) return;
			try {
				const payload = JSON.parse(
					entry.message.slice(DESIGN_SELECT_MARKER.length),
				) as { n?: string; x: unknown; y: unknown };
				// Reject spoofed markers: the nonce must match this session's.
				if (payload.n !== this.nonces.get(paneId)) return;
				// Reject non-numeric coordinates a forged marker might inject.
				if (!Number.isFinite(payload.x) || !Number.isFinite(payload.y)) {
					return;
				}
				this.emit(`design-event:${paneId}`, {
					type: "selected",
					clientPoint: { x: payload.x as number, y: payload.y as number },
				} satisfies DesignModeEvent);
			} catch {
				// Ignore malformed markers.
			}
		};
		this.markerListeners.set(paneId, listener);
		browserManager.on(`console:${paneId}`, listener);

		// A full navigation/reload destroys the injected overlay; re-inject so
		// Design Mode keeps working instead of silently breaking.
		const wc = browserManager.getWebContents(paneId);
		if (wc) {
			const onNavigate = () => {
				if (!this.enabledPanes.has(paneId)) return;
				const current = this.nonces.get(paneId);
				if (!current) return;
				browserManager
					.evaluateJS(paneId, buildEnablePickerScript(current))
					.catch(() => {});
			};
			wc.on("did-navigate", onNavigate);
			wc.on("did-navigate-in-page", onNavigate);
			this.navCleanups.set(paneId, () => {
				try {
					wc.off("did-navigate", onNavigate);
					wc.off("did-navigate-in-page", onNavigate);
				} catch {
					// webContents may be destroyed.
				}
			});
		}

		this.emit(`design-event:${paneId}`, {
			type: "enabled",
		} satisfies DesignModeEvent);
	}

	private async disable(paneId: string): Promise<void> {
		if (!this.enabledPanes.has(paneId)) return;
		this.enabledPanes.delete(paneId);
		this.nonces.delete(paneId);
		const listener = this.markerListeners.get(paneId);
		if (listener) {
			browserManager.off(`console:${paneId}`, listener);
			this.markerListeners.delete(paneId);
		}
		const navCleanup = this.navCleanups.get(paneId);
		if (navCleanup) {
			navCleanup();
			this.navCleanups.delete(paneId);
		}
		try {
			await browserManager.evaluateJS(paneId, buildDisablePickerScript());
		} catch {
			// Page may have navigated away; the overlay is gone regardless.
		}
		this.emit(`design-event:${paneId}`, {
			type: "disabled",
		} satisfies DesignModeEvent);
	}

	onEvent(
		paneId: string,
		handler: (event: DesignModeEvent) => void,
	): () => void {
		const key = `design-event:${paneId}`;
		this.on(key, handler);
		return () => this.off(key, handler);
	}

	getCapture(captureId: string): DesignModeCapture | undefined {
		return this.captures.get(captureId);
	}

	async captureElement(input: {
		paneId: string;
		workspaceId: string;
		workspaceRoot?: string;
		devicePresetId?: string;
		clientPoint?: { x: number; y: number };
	}): Promise<DesignModeCapture> {
		// Chain on the pane's previous capture (success or failure) so the
		// overlay hide/show can't interleave across concurrent captures.
		const prior = this.captureChains.get(input.paneId) ?? Promise.resolve();
		const next = prior.then(
			() => this.performCapture(input),
			() => this.performCapture(input),
		);
		const tail = next.catch(() => {});
		this.captureChains.set(input.paneId, tail);
		void tail.then(() => {
			if (this.captureChains.get(input.paneId) === tail) {
				this.captureChains.delete(input.paneId);
			}
		});
		return next;
	}

	private async performCapture(input: {
		paneId: string;
		workspaceId: string;
		workspaceRoot?: string;
		devicePresetId?: string;
		clientPoint?: { x: number; y: number };
	}): Promise<DesignModeCapture> {
		const { paneId, workspaceId, workspaceRoot, clientPoint } = input;

		const wc = browserManager.getWebContents(paneId);
		if (!wc) throw new Error(`No browser content for pane ${paneId}`);

		// Without an explicit click point (direct API use), target the viewport
		// center so we still resolve a meaningful element.
		const point =
			clientPoint ??
			((await browserManager.evaluateJS(
				paneId,
				"({x: Math.floor(window.innerWidth/2), y: Math.floor(window.innerHeight/2)})",
			)) as { x: number; y: number });

		const raw = await browserManager.evaluateJS(
			paneId,
			buildSerializeElementScript({
				x: point.x,
				y: point.y,
				cssWhitelist: CSS_WHITELIST,
				maxOuterHtml: MAX_HTML_BYTES,
			}),
		);

		const parsed = rawElementDescriptorSchema.safeParse(raw);
		if (!parsed.success) {
			throw new Error("Could not read the selected element");
		}
		const desc = parsed.data;

		// Screenshot: hide the overlay, crop, then restore it.
		const crop = computeCropRect(desc.rect, {
			width: desc.viewport.width,
			height: desc.viewport.height,
		});
		await browserManager.evaluateJS(
			paneId,
			buildSetHighlightVisibleScript(false),
		);
		let shot: { data: string; width: number; height: number };
		try {
			shot = await browserManager.captureRegion(paneId, crop);
		} finally {
			if (this.enabledPanes.has(paneId)) {
				await browserManager
					.evaluateJS(paneId, buildSetHighlightVisibleScript(true))
					.catch(() => {});
			}
		}

		const captureId = randomUUID();
		const url = wc.getURL();
		const title = wc.getTitle();

		// Enforce payload limits + CSS whitelist server-side (defense in depth).
		const { html: outerHTML } = truncateHtml(desc.outerHTML);
		const computed = filterComputedStyles(desc.computedStyles);

		const screenshotBytes = base64ByteSize(shot.data);
		const withinLimit = isScreenshotWithinLimit(screenshotBytes);

		// Only write (and reference) a file when we actually have in-limit data,
		// so a `path`-style hand-off never points at a non-existent file.
		const screenshotPath = withinLimit
			? await this.persistScreenshot(workspaceRoot, captureId, shot.data)
			: "";

		const source = this.resolveSource(desc.sourceHint, workspaceRoot);

		const capture: DesignModeCapture = {
			id: captureId,
			workspaceId,
			browserSessionId: paneId,
			url,
			title: title || undefined,
			timestamp: new Date().toISOString(),
			selector: buildSelectorHints(desc),
			bounds: toCaptureBounds(desc),
			html: {
				outerHTML,
				parentContextHTML: desc.parentOuterHTML
					? truncateHtml(desc.parentOuterHTML).html
					: undefined,
				nearbyText: desc.nearbyText,
			},
			styles: { computed },
			screenshot: {
				path: screenshotPath,
				data: withinLimit ? shot.data : "",
				mimeType: "image/png",
				width: shot.width,
				height: shot.height,
			},
			source,
			devicePresetId: input.devicePresetId ?? "responsive",
		};

		this.store(capture);
		console.log(
			`[design-mode] capture ${captureId} pane=${paneId} html=${Buffer.byteLength(
				outerHTML,
			)}B css=${Object.keys(computed).length} shot=${screenshotBytes}B${
				withinLimit ? "" : " (over-limit, omitted)"
			}`,
		);
		return capture;
	}

	private resolveSource(
		hint: { filePath?: string; line?: number; column?: number } | undefined,
		workspaceRoot: string | undefined,
	): DesignModeCapture["source"] {
		if (!hint?.filePath || !workspaceRoot) return undefined;
		const normalized = normalizeSourcePath(workspaceRoot, hint.filePath);
		if (!normalized) return undefined;
		return {
			filePath: normalized.filePath,
			line: hint.line,
			column: hint.column,
			framework: inferFramework(normalized.filePath),
			confidence: hint.line != null ? "medium" : "low",
		};
	}

	private async persistScreenshot(
		workspaceRoot: string | undefined,
		captureId: string,
		base64: string,
	): Promise<string> {
		const dir = workspaceRoot
			? path.join(workspaceRoot, CAPTURE_DIR_NAME)
			: path.join(os.tmpdir(), "rox-design-captures");
		const filePath = path.join(dir, `${captureId}.png`);
		if (!base64) return ""; // nothing written → no path to reference
		await mkdir(dir, { recursive: true });
		await writeFile(filePath, Buffer.from(base64, "base64"));
		return filePath;
	}

	private store(capture: DesignModeCapture): void {
		this.captures.set(capture.id, capture);
		this.captureOrder.push(capture.id);
		while (this.captureOrder.length > MAX_STORED_CAPTURES) {
			const evicted = this.captureOrder.shift();
			if (evicted) {
				const old = this.captures.get(evicted);
				this.captures.delete(evicted);
				if (old?.screenshot.path) {
					void rm(old.screenshot.path, { force: true }).catch(() => {});
				}
			}
		}
	}

	/** Tears down Design Mode + cached captures for a pane (on pane/app close). */
	async cleanup(paneId: string): Promise<void> {
		await this.disable(paneId).catch(() => {});
		const removals: Promise<unknown>[] = [];
		for (const [id, capture] of [...this.captures]) {
			if (capture.browserSessionId !== paneId) continue;
			this.captures.delete(id);
			this.captureOrder = this.captureOrder.filter((c) => c !== id);
			if (capture.screenshot.path) {
				removals.push(rm(capture.screenshot.path, { force: true }));
			}
		}
		// Wait for deletions so screenshots are gone on disk before we return.
		await Promise.allSettled(removals);
	}
}

export const designModeCaptureService = new DesignModeCaptureService();
