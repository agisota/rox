const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");
const {
	cleanupPackagedAppHelpers,
} = require("./canvas-smoke-process-cleanup.cjs");

const desktopRoot = path.resolve(__dirname, "..");
const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const evidenceDir =
	process.env.ROX_CANVAS_SMOKE_EVIDENCE_DIR ??
	path.join(
		os.homedir(),
		".ai-agent-hub/evidence/playwright-smoke",
		`rox-canvas-${today}`,
	);

function readOption(name, fallback) {
	const equalsArg = process.argv.find((arg) => arg.startsWith(`--${name}=`));
	if (equalsArg) return equalsArg.slice(name.length + 3);
	const index = process.argv.indexOf(`--${name}`);
	if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
	return fallback;
}

const mode = readOption("mode", "compiled");
if (mode !== "compiled" && mode !== "packaged") {
	throw new Error(`Unsupported Canvas smoke mode: ${mode}`);
}

const reportPath = path.join(evidenceDir, `canvas-${mode}-journey-smoke.json`);
const screenshotPath = path.join(
	evidenceDir,
	`canvas-${mode}-journey-smoke.png`,
);
const packagedAppRoot = path.join(desktopRoot, "release/mac-arm64/Rox.app");
const packagedExecutablePath = path.join(packagedAppRoot, "Contents/MacOS/Rox");
const compiledMainPath = path.join(desktopRoot, "dist/main/index.js");
const compiledRendererUrl = `file://${path.join(
	desktopRoot,
	"dist/renderer/index.html",
)}#/canvas/`;
let activeReport = null;

function resolveCompiledElectronExecutable() {
	if (process.env.ROX_ELECTRON_EXECUTABLE) {
		return process.env.ROX_ELECTRON_EXECUTABLE;
	}
	const electronPath = require("electron");
	if (typeof electronPath !== "string") {
		throw new Error(
			"The electron package did not resolve to an executable path",
		);
	}
	return electronPath;
}

async function assertPathExists(targetPath, label) {
	try {
		await fs.access(targetPath);
	} catch (error) {
		throw new Error(`${label} is missing at ${targetPath}`, { cause: error });
	}
}

function analyzeText(text) {
	const value = String(text || "");
	const revisionMatch = value.match(
		/Revision\s+(\d+)\s+·\s+(\d+)\s+nodes\s+·\s+(\d+)\s+edges/i,
	);
	return {
		visibleTextSample: value.slice(0, 4000),
		hasSignInGate: /Войдите|Продолжить с GitHub|sign in|GitHub/i.test(value),
		hasNoWorkspaceSelected: /No workspace selected/i.test(value),
		hasStartingLocalCanvas: /Starting local Canvas workspace/i.test(value),
		hasCanvasTitle: /Production Canvas Workspace|Canvas Workspace/i.test(value),
		hasAddTextNode: /Add text node/i.test(value),
		hasImportExport: /Import\s*\/\s*Export|Export JSON|Import JSON/i.test(
			value,
		),
		hasCanvasLiveSync:
			/Live sync:\s+(polling every|refreshing canonical)/i.test(value),
		hasUndoRedo: /Undo[\s\S]*Redo|Redo[\s\S]*Undo/i.test(value),
		hasTextCard:
			/Text card|New canvas card persisted as a CanvasMutation batch/i.test(
				value,
			),
		revision: revisionMatch ? Number(revisionMatch[1]) : null,
		nodeCount: revisionMatch ? Number(revisionMatch[2]) : null,
		edgeCount: revisionMatch ? Number(revisionMatch[3]) : null,
	};
}

async function writeReport(report) {
	await fs.mkdir(evidenceDir, { recursive: true });
	await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
}

async function readState(page) {
	const visibleText = await page
		.evaluate(() => document.body?.innerText ?? "")
		.catch((error) => `body-error:${error.message}`);
	const analyzed = analyzeText(visibleText);
	return {
		finalUrl: page.url(),
		...analyzed,
		hasUsableCanvas:
			analyzed.hasCanvasTitle &&
			analyzed.hasAddTextNode &&
			analyzed.hasImportExport &&
			analyzed.hasUndoRedo &&
			!analyzed.hasSignInGate &&
			!analyzed.hasNoWorkspaceSelected &&
			!analyzed.hasStartingLocalCanvas &&
			analyzed.hasCanvasLiveSync,
	};
}

async function waitForState(page, predicate, timeoutMs, label, events) {
	const deadline = Date.now() + timeoutMs;
	let state = await readState(page);
	while (!page.isClosed() && Date.now() < deadline) {
		state = await readState(page);
		if (predicate(state)) return state;
		await new Promise((resolve) => setTimeout(resolve, 300));
	}
	events.push({
		type: "wait.timeout",
		at: new Date().toISOString(),
		label,
		state,
	});
	const error = new Error(`Timed out waiting for ${label}`);
	error.state = state;
	throw error;
}

async function clickHitTestableReactFlowNode(page, events) {
	const marker = page.getByTestId("canvas-flow-node").first();
	let markerBox = await marker.boundingBox().catch(() => null);
	if (markerBox) {
		const viewport = page.viewportSize() ?? { width: 1440, height: 1000 };
		const isInsideViewport = (box) => {
			const x = box.x + box.width / 2;
			const y = box.y + box.height / 2;
			return x >= 0 && x <= viewport.width && y >= 0 && y <= viewport.height;
		};
		if (!isInsideViewport(markerBox)) {
			const paneBox = await page
				.locator(".react-flow__pane")
				.first()
				.boundingBox()
				.catch(() => null);
			if (paneBox) {
				const markerCenterX = markerBox.x + markerBox.width / 2;
				const markerCenterY = markerBox.y + markerBox.height / 2;
				const targetX = paneBox.x + paneBox.width / 2;
				const targetY = paneBox.y + paneBox.height / 2;
				const dragDeltaX = targetX - markerCenterX;
				const dragDeltaY = targetY - markerCenterY;
				const dragStartX = paneBox.x + paneBox.width / 2;
				const dragStartY = paneBox.y + paneBox.height / 2;
				events.push({
					type: "reactFlowNode.panIntoView",
					at: new Date().toISOString(),
					dragDeltaX: Math.round(dragDeltaX),
					dragDeltaY: Math.round(dragDeltaY),
				});
				await page.mouse.move(dragStartX, dragStartY);
				await page.mouse.down();
				await page.mouse.move(
					dragStartX + dragDeltaX,
					dragStartY + dragDeltaY,
					{
						steps: 12,
					},
				);
				await page.mouse.up();
				markerBox = await marker.boundingBox().catch(() => markerBox);
			}
		}
		if (!isInsideViewport(markerBox)) {
			events.push({
				type: "reactFlowNode.domDispatchClick",
				at: new Date().toISOString(),
				x: Math.round(markerBox.x + markerBox.width / 2),
				y: Math.round(markerBox.y + markerBox.height / 2),
			});
			await marker.evaluate((element) => {
				const target = element.closest(".react-flow__node") ?? element;
				const eventInit = {
					bubbles: true,
					button: 0,
					buttons: 1,
					cancelable: true,
					clientX: 1,
					clientY: 1,
					view: window,
				};
				for (const type of [
					"pointerdown",
					"mousedown",
					"pointerup",
					"mouseup",
					"click",
				]) {
					const EventConstructor =
						type.startsWith("pointer") && "PointerEvent" in window
							? PointerEvent
							: MouseEvent;
					target.dispatchEvent(new EventConstructor(type, eventInit));
				}
			});
			return;
		}
		const clickX = markerBox.x + markerBox.width / 2;
		const clickY = markerBox.y + markerBox.height / 2;
		events.push({
			type: "reactFlowNode.markerClick",
			at: new Date().toISOString(),
			x: Math.round(clickX),
			y: Math.round(clickY),
		});
		await page.mouse.click(clickX, clickY);
		return;
	}

	const hitTarget = await page.evaluate(() => {
		const flow = document.querySelector(".canvas-react-flow");
		const flowRect =
			flow instanceof HTMLElement ? flow.getBoundingClientRect() : null;
		const left = Math.max(0, flowRect?.left ?? 0);
		const top = Math.max(0, flowRect?.top ?? 0);
		const right = Math.min(
			window.innerWidth,
			flowRect?.right ?? window.innerWidth,
		);
		const bottom = Math.min(
			window.innerHeight,
			flowRect?.bottom ?? window.innerHeight,
		);
		for (let y = top + 24; y < bottom - 24; y += 24) {
			for (let x = left + 24; x < right - 24; x += 24) {
				const topElement = document.elementFromPoint(x, y);
				const node = topElement?.closest(".react-flow__node");
				if (!(node instanceof HTMLElement)) continue;
				const marker = node.querySelector("[data-testid='canvas-flow-node']");
				if (!marker) continue;
				return {
					id: node.dataset.id ?? marker.getAttribute("data-canvas-node-id"),
					x,
					y,
				};
			}
		}
		return null;
	});
	if (!hitTarget) {
		throw new Error("No hit-testable React Flow node was available");
	}
	events.push({
		type: "reactFlowNode.hitTarget",
		at: new Date().toISOString(),
		id: hitTarget.id,
		x: Math.round(hitTarget.x),
		y: Math.round(hitTarget.y),
	});
	await page.mouse.click(hitTarget.x, hitTarget.y);
}

async function dismissUpdateNotification(page, events) {
	const laterButton = page.getByRole("button", { name: /^Позже$/ });
	if (!(await laterButton.isVisible().catch(() => false))) return;
	await laterButton.click({ timeout: 5_000 }).catch((error) => {
		events.push({
			type: "updateNotification.dismissFailed",
			at: new Date().toISOString(),
			message: error.message,
		});
	});
	events.push({
		type: "updateNotification.dismissed",
		at: new Date().toISOString(),
	});
}

async function navigateToCanvas(page, events) {
	await page
		.waitForLoadState("domcontentloaded", { timeout: 25_000 })
		.catch((error) => {
			events.push({
				type: "domcontentloaded.error",
				at: new Date().toISOString(),
				message: error.message,
			});
		});
	if (mode === "compiled") {
		await page.goto(compiledRendererUrl, {
			waitUntil: "domcontentloaded",
			timeout: 25_000,
		});
		return;
	}
	const packagedRendererUrl = `${page.url().split("#")[0]}#/canvas/`;
	await page.goto(packagedRendererUrl, {
		waitUntil: "domcontentloaded",
		timeout: 25_000,
	});
	await page.evaluate(() => {
		if (window.location.hash !== "#/canvas/") {
			window.location.hash = "#/canvas/";
			window.dispatchEvent(new HashChangeEvent("hashchange"));
		}
	});
}

function modifierKey() {
	return process.platform === "darwin" ? "Meta" : "Control";
}

function jsonFulfillment(body, status = 200) {
	return {
		status,
		contentType: "application/json",
		headers: {
			"access-control-allow-origin": "*",
			"access-control-allow-headers": "*",
			"access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
			"access-control-expose-headers":
				"electric-cursor,electric-handle,electric-offset,electric-schema,electric-up-to-date",
		},
		body: JSON.stringify(body),
	};
}

function emptyFulfillment(status = 204) {
	return {
		status,
		headers: {
			"access-control-allow-origin": "*",
			"access-control-allow-headers": "*",
			"access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
			"access-control-expose-headers":
				"electric-cursor,electric-handle,electric-offset,electric-schema,electric-up-to-date",
		},
		body: "",
	};
}

async function installExternalNetworkQuarantine(context, counters) {
	const patterns = [
		"https://api.rox.one/**",
		"https://electric-proxy.scharlesky-192.workers.dev/**",
		"https://streams.rox.one/**",
		"https://relay.rox.one/**",
		"https://us.i.posthog.com/**",
		"https://api.openpanel.dev/**",
	];

	const fulfillExternal = async (route) => {
		const request = route.request();
		const requestUrl = new URL(request.url());
		counters.total += 1;
		counters.hosts[requestUrl.host] =
			(counters.hosts[requestUrl.host] ?? 0) + 1;

		if (request.method() === "OPTIONS") {
			await route.fulfill(emptyFulfillment());
			return;
		}

		if (requestUrl.pathname.includes("/api/auth/")) {
			await route.fulfill(
				jsonFulfillment({
					session: {
						id: "local-playwright-smoke-session",
						userId: "mock-user-id",
						expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
					},
					user: {
						id: "mock-user-id",
						name: "Canvas Smoke",
						email: "canvas-smoke@local.test",
						onboardedAt: new Date().toISOString(),
					},
				}),
			);
			return;
		}

		if (requestUrl.pathname.includes("/api/desktop/version")) {
			await route.fulfill(
				jsonFulfillment({
					version: "2.0.21",
					updateAvailable: false,
					channel: "canvas-smoke",
				}),
			);
			return;
		}

		if (requestUrl.pathname.includes("/api/trpc")) {
			const payload =
				requestUrl.searchParams.get("batch") === "1"
					? [{ result: { data: null } }]
					: { result: { data: null } };
			await route.fulfill(jsonFulfillment(payload));
			return;
		}

		if (requestUrl.pathname.includes("/v1/shape")) {
			const tableName = requestUrl.searchParams.get("table") ?? "shape";
			const handle = `canvas-smoke-${tableName.replace(/[^a-z0-9_-]/gi, "-")}`;
			await new Promise((resolve) => setTimeout(resolve, 1_000));
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				headers: {
					"access-control-allow-origin": "*",
					"access-control-allow-headers": "*",
					"access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
					"access-control-expose-headers":
						"electric-cursor,electric-handle,electric-offset,electric-schema,electric-up-to-date",
					"electric-cursor": `${handle}-cursor`,
					"electric-handle": handle,
					"electric-offset": "0_0",
					"electric-schema": "{}",
				},
				body: JSON.stringify([{ headers: { control: "up-to-date" } }]),
			});
			return;
		}

		await route.fulfill(emptyFulfillment());
	};

	for (const pattern of patterns) {
		await context.route(pattern, fulfillExternal);
	}
}

function importedJsonCanvasFixture() {
	return JSON.stringify(
		{
			nodes: [
				{
					id: "smoke-text-a",
					type: "text",
					x: 80,
					y: 90,
					width: 260,
					height: 140,
					text: "Imported smoke source",
					color: "#38bdf8",
				},
				{
					id: "smoke-text-b",
					type: "text",
					x: 430,
					y: 160,
					width: 280,
					height: 150,
					text: "Imported smoke target",
					color: "2",
				},
				{
					id: "smoke-group",
					type: "group",
					x: 40,
					y: 50,
					width: 760,
					height: 340,
					label: "Smoke group",
				},
			],
			edges: [
				{
					id: "smoke-edge",
					fromNode: "smoke-text-a",
					toNode: "smoke-text-b",
					label: "connects",
					color: "#22d3ee",
				},
			],
		},
		null,
		2,
	);
}

async function getExportedJsonCanvas(page, predicate = () => true) {
	const exportedTextarea = page.getByLabel("Exported JSON Canvas");
	await exportedTextarea.waitFor({ state: "visible", timeout: 15_000 });
	const deadline = Date.now() + 15_000;
	let lastParsed = null;
	while (Date.now() < deadline) {
		const exportedText = await exportedTextarea.inputValue();
		lastParsed = JSON.parse(exportedText);
		if (predicate(lastParsed)) return lastParsed;
		await new Promise((resolve) => setTimeout(resolve, 300));
	}
	throw new Error(
		`Timed out waiting for matching exported JSON Canvas: ${JSON.stringify(lastParsed)?.slice(0, 500)}`,
	);
}

async function run() {
	const events = [];
	const e2eWorkspaceRoot = await fs.mkdtemp(
		path.join(os.tmpdir(), "rox-canvas-smoke-workspace-"),
	);
	const report = {
		ok: false,
		mode,
		evidenceDir,
		reportPath,
		screenshotPath,
		e2eWorkspaceRoot,
		checkedAt: new Date().toISOString(),
		events,
		assertions: {},
	};
	activeReport = report;
	const externalNetworkQuarantine = { total: 0, hosts: {} };
	const push = async (type, data = {}) => {
		events.push({ type, at: new Date().toISOString(), ...data });
		report.checkedAt = new Date().toISOString();
		await writeReport(report).catch(() => {});
	};

	await push("start");

	const executablePath =
		mode === "packaged"
			? packagedExecutablePath
			: resolveCompiledElectronExecutable();
	const launchArgs = mode === "packaged" ? [] : [compiledMainPath];
	await assertPathExists(executablePath, `${mode} Electron executable`);
	if (mode === "compiled") {
		await assertPathExists(compiledMainPath, "compiled Electron main bundle");
		await assertPathExists(
			path.join(desktopRoot, "dist/renderer/index.html"),
			"compiled renderer index",
		);
	}

	const app = await electron.launch({
		executablePath,
		args: launchArgs,
		cwd: mode === "packaged" ? path.dirname(executablePath) : desktopRoot,
		env: {
			...process.env,
			NODE_ENV: "production",
			ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
			NEXT_PUBLIC_E2E_AUTH_BYPASS: "1",
			NEXT_PUBLIC_E2E_AUTH_BYPASS_SCOPE: "local-playwright-smoke",
			ROX_E2E_CANVAS_WORKSPACE_ROOT: e2eWorkspaceRoot,
			ROX_E2E_CANVAS_WORKSPACE_BRANCH: "main",
		},
		timeout: 25_000,
	});

	const child = app.process();
	child.stdout?.on("data", (chunk) => {
		events.push({
			type: "main.stdout",
			at: new Date().toISOString(),
			text: String(chunk).slice(0, 2000),
		});
	});
	child.stderr?.on("data", (chunk) => {
		events.push({
			type: "main.stderr",
			at: new Date().toISOString(),
			text: String(chunk).slice(0, 2000),
		});
	});
	child.on("exit", (code, signal) => {
		events.push({
			type: "main.exit",
			at: new Date().toISOString(),
			code,
			signal,
		});
	});
	await push("launched", { executablePath, launchArgs });

	try {
		await installExternalNetworkQuarantine(
			app.context(),
			externalNetworkQuarantine,
		);
		await push("externalNetworkQuarantine.installed");

		const page = await app.firstWindow({ timeout: 25_000 });
		page.on("console", (msg) => {
			events.push({
				type: "page.console",
				at: new Date().toISOString(),
				level: msg.type(),
				text: msg.text().slice(0, 2000),
			});
		});
		page.on("pageerror", (error) => {
			events.push({
				type: "page.error",
				at: new Date().toISOString(),
				message: error.message,
				stack: error.stack,
			});
		});
		await push("firstWindow", { url: page.url() });

		await navigateToCanvas(page, events);
		await push("after.navigateToCanvas", {
			url: page.url(),
			closed: page.isClosed(),
		});

		const initialState = await waitForState(
			page,
			(state) => state.hasUsableCanvas && Number.isFinite(state.nodeCount),
			45_000,
			"usable Canvas with revision counters",
			events,
		);
		report.assertions.initial = initialState;
		if (!initialState.hasCanvasLiveSync) {
			throw new Error("Canvas live sync status was not visible");
		}
		await dismissUpdateNotification(page, events);
		await push("usable", {
			nodeCount: initialState.nodeCount,
			edgeCount: initialState.edgeCount,
			revision: initialState.revision,
			hasCanvasLiveSync: initialState.hasCanvasLiveSync,
		});

		const zoomToSelectionButton = page.getByRole("button", {
			name: /^zoomToSelection$/,
		});
		await zoomToSelectionButton.waitFor({ state: "visible", timeout: 10_000 });
		const zoomToSelectionDisabledBeforeSelection =
			await zoomToSelectionButton.isDisabled();
		if (!zoomToSelectionDisabledBeforeSelection) {
			throw new Error(
				"zoomToSelection capability was enabled before a Canvas selection existed",
			);
		}

		await page.getByRole("button", { name: /^Add text node$/ }).click({
			timeout: 10_000,
		});
		const afterAdd = await waitForState(
			page,
			(state) =>
				state.hasTextCard && state.nodeCount >= initialState.nodeCount + 1,
			15_000,
			"added text node rendered and counted",
			events,
		);
		report.assertions.afterAdd = {
			nodeCount: afterAdd.nodeCount,
			revision: afterAdd.revision,
			hasTextCard: afterAdd.hasTextCard,
		};
		await push("after.addTextNode", report.assertions.afterAdd);

		await page
			.getByTestId("canvas-flow-node")
			.first()
			.waitFor({ state: "visible", timeout: 10_000 });
		await clickHitTestableReactFlowNode(page, events);
		const afterNodeSelection = await waitForState(
			page,
			(state) => /\b1 selected\b/i.test(state.visibleTextSample),
			10_000,
			"React Flow node selection reached CanvasWorkspaceView",
			events,
		);
		const zoomToSelectionDisabledAfterSelection =
			await zoomToSelectionButton.isDisabled();
		if (zoomToSelectionDisabledAfterSelection) {
			throw new Error(
				"zoomToSelection capability stayed disabled after selecting a Canvas node",
			);
		}
		await zoomToSelectionButton.click({ timeout: 10_000 });
		await page
			.getByText(/ok=true/i)
			.last()
			.waitFor({ state: "visible", timeout: 10_000 });
		report.assertions.selectionAwareCapability = {
			selectedTextVisible: /\b1 selected\b/i.test(
				afterNodeSelection.visibleTextSample,
			),
			disabledBeforeSelection: zoomToSelectionDisabledBeforeSelection,
			enabledAfterSelection: !zoomToSelectionDisabledAfterSelection,
			resultVisible: true,
		};
		await push(
			"after.selectionAwareCapability",
			report.assertions.selectionAwareCapability,
		);

		await page.keyboard.press(`${modifierKey()}+Z`);
		const afterKeyboardUndo = await waitForState(
			page,
			(state) => state.nodeCount === initialState.nodeCount,
			15_000,
			"keyboard undo restored initial node count",
			events,
		);
		report.assertions.afterKeyboardUndo = {
			nodeCount: afterKeyboardUndo.nodeCount,
			revision: afterKeyboardUndo.revision,
		};
		await push("after.keyboardUndo", report.assertions.afterKeyboardUndo);

		await page.keyboard.press(`${modifierKey()}+Shift+Z`);
		const afterKeyboardRedo = await waitForState(
			page,
			(state) =>
				state.hasTextCard && state.nodeCount >= initialState.nodeCount + 1,
			15_000,
			"keyboard redo restored added text node",
			events,
		);
		report.assertions.afterKeyboardRedo = {
			nodeCount: afterKeyboardRedo.nodeCount,
			revision: afterKeyboardRedo.revision,
			hasTextCard: afterKeyboardRedo.hasTextCard,
		};
		await push("after.keyboardRedo", report.assertions.afterKeyboardRedo);

		await page.keyboard.press(`${modifierKey()}+Shift+P`);
		const commandSearch = page.getByPlaceholder(
			"Search Canvas actions, capabilities, import/export...",
		);
		await commandSearch.waitFor({ state: "visible", timeout: 10_000 });
		await commandSearch.fill("export");
		await page.getByRole("button", { name: /Export JSON Canvas/i }).click({
			timeout: 10_000,
		});
		const exportedJson = await getExportedJsonCanvas(page, (jsonCanvas) =>
			Array.isArray(jsonCanvas.nodes)
				? jsonCanvas.nodes.some((node) =>
						/Text card|New canvas card/i.test(
							`${node?.label ?? ""} ${node?.text ?? ""}`,
						),
					)
				: false,
		);
		const exportedNodeCount = Array.isArray(exportedJson.nodes)
			? exportedJson.nodes.length
			: -1;
		const exportedEdgeCount = Array.isArray(exportedJson.edges)
			? exportedJson.edges.length
			: -1;
		const exportedHasTextNode =
			Array.isArray(exportedJson.nodes) &&
			exportedJson.nodes.some((node) =>
				/Text card|New canvas card/i.test(
					`${node?.label ?? ""} ${node?.text ?? ""}`,
				),
			);
		if (
			exportedNodeCount < afterKeyboardRedo.nodeCount ||
			!exportedHasTextNode
		) {
			throw new Error(
				`Exported JSON Canvas missed added text node: exportedNodeCount=${exportedNodeCount}, afterRedoNodeCount=${afterKeyboardRedo.nodeCount}, exportedHasTextNode=${exportedHasTextNode}`,
			);
		}
		report.assertions.commandPaletteExport = {
			nodeCount: exportedNodeCount,
			edgeCount: exportedEdgeCount,
			hasTextNode: exportedHasTextNode,
		};
		await push(
			"after.commandPaletteExport",
			report.assertions.commandPaletteExport,
		);

		const importTextarea = page.getByPlaceholder(
			/Paste Obsidian JSON Canvas here/,
		);
		await importTextarea.fill("{");
		await page.getByRole("button", { name: /^Import JSON$/ }).click({
			timeout: 10_000,
		});
		await waitForState(
			page,
			(state) =>
				/Expected property name|Unexpected|JSON/i.test(state.visibleTextSample),
			10_000,
			"invalid JSON Canvas import error surfaced",
			events,
		);
		report.assertions.invalidImportRejected = true;
		await push("after.invalidImportRejected");

		await importTextarea.fill("shortcut guard text");
		await page.keyboard.press(`${modifierKey()}+Z`);
		const afterTextareaShortcut = await readState(page);
		if (afterTextareaShortcut.nodeCount !== afterKeyboardRedo.nodeCount) {
			throw new Error(
				"Canvas undo shortcut fired while import textarea had focus",
			);
		}
		report.assertions.textareaShortcutGuard = {
			nodeCount: afterTextareaShortcut.nodeCount,
		};
		await push(
			"after.textareaShortcutGuard",
			report.assertions.textareaShortcutGuard,
		);

		await importTextarea.fill(importedJsonCanvasFixture());
		await page.getByRole("button", { name: /^Import JSON$/ }).click({
			timeout: 10_000,
		});
		const afterValidImport = await waitForState(
			page,
			(state) =>
				/Imported JSON Canvas/i.test(state.visibleTextSample) &&
				state.nodeCount === 2 &&
				state.edgeCount === 1,
			20_000,
			"valid JSON Canvas imported graph opened",
			events,
		);
		report.assertions.validImport = {
			nodeCount: afterValidImport.nodeCount,
			edgeCount: afterValidImport.edgeCount,
			revision: afterValidImport.revision,
		};
		await push("after.validImport", report.assertions.validImport);

		await page.getByRole("button", { name: /^Export JSON$/ }).click({
			timeout: 10_000,
		});
		const importedExport = await getExportedJsonCanvas(
			page,
			(jsonCanvas) =>
				Array.isArray(jsonCanvas.nodes) &&
				Array.isArray(jsonCanvas.edges) &&
				jsonCanvas.nodes.some((node) => node?.id === "smoke-group") &&
				jsonCanvas.edges.some((edge) => edge?.id === "smoke-edge"),
		);
		const importedExportNodeCount = Array.isArray(importedExport.nodes)
			? importedExport.nodes.length
			: -1;
		const importedExportEdgeCount = Array.isArray(importedExport.edges)
			? importedExport.edges.length
			: -1;
		if (importedExportNodeCount !== 3 || importedExportEdgeCount !== 1) {
			throw new Error(
				`Imported graph export mismatch: nodes=${importedExportNodeCount}, edges=${importedExportEdgeCount}`,
			);
		}
		report.assertions.importedGraphExport = {
			nodeCount: importedExportNodeCount,
			edgeCount: importedExportEdgeCount,
		};
		await push(
			"after.importedGraphExport",
			report.assertions.importedGraphExport,
		);

		const finalState = await readState(page);
		await page.screenshot({ path: screenshotPath, fullPage: true });
		const auth401ConsoleEvents = events.filter(
			(event) =>
				event.type === "page.console" &&
				/(Failed to load resource|401|Unauthorized)/i.test(event.text ?? ""),
		);
		const externalNetworkConsoleErrors = events.filter(
			(event) =>
				event.type === "page.console" &&
				/(Electric sync error|MissingHeadersError|fast retry loop|Failed to load resource|401|Unauthorized)/i.test(
					event.text ?? "",
				),
		);
		report.assertions.externalNetworkQuarantine = {
			...externalNetworkQuarantine,
			auth401ConsoleEvents: auth401ConsoleEvents.length,
			externalNetworkConsoleErrors: externalNetworkConsoleErrors.length,
		};
		if (externalNetworkConsoleErrors.length > 0) {
			throw new Error(
				`Canvas smoke saw external network console noise: ${externalNetworkConsoleErrors
					.map((event) => event.text)
					.join(" | ")
					.slice(0, 1000)}`,
			);
		}
		Object.assign(report, finalState, {
			ok: true,
			screenshotPath,
			checkedAt: new Date().toISOString(),
		});
		await writeReport(report);
		console.log(JSON.stringify(report, null, 2));
	} finally {
		await Promise.race([
			app.close(),
			new Promise((resolve) => setTimeout(resolve, 2000)),
		]).catch(() => {});
		if (!child.killed) {
			child.kill("SIGTERM");
		}
		if (mode === "packaged") {
			const cleanup = await cleanupPackagedAppHelpers({ packagedAppRoot });
			if (cleanup.killedPids.length > 0) {
				events.push({
					type: "cleanup.packagedHelpers",
					at: new Date().toISOString(),
					killedPids: cleanup.killedPids,
				});
				await writeReport(report).catch(() => {});
			}
		}
		await fs
			.rm(e2eWorkspaceRoot, { force: true, recursive: true })
			.catch(() => {});
	}
}

Promise.race([
	run(),
	new Promise((_, reject) =>
		setTimeout(
			() => reject(new Error(`Canvas ${mode} journey smoke timed out`)),
			120_000,
		),
	),
]).then(
	() => {
		process.exit(0);
	},
	async (error) => {
		const fallback = {
			...(activeReport ?? {}),
			ok: false,
			mode,
			error: error.message,
			lastState: error.state ?? activeReport?.lastState,
			stack: error.stack,
			checkedAt: new Date().toISOString(),
		};
		if (Array.isArray(fallback.events)) {
			fallback.events.push({
				type: "error",
				at: fallback.checkedAt,
				message: error.message,
			});
		}
		await writeReport(fallback).catch(() => {});
		console.error(JSON.stringify(fallback, null, 2));
		process.exit(1);
	},
);
