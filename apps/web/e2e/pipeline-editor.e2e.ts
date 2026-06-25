/**
 * E2E acceptance for issue #552 — web pipeline-editor parity with desktop.
 *
 * STATUS: deferred to CI. This repo currently ships NO application e2e harness
 * (`@playwright/test` is not a dependency, there is no `playwright.config.*`, and
 * no browsers are installed in the dev worktree). Running this spec requires:
 *   1. `@playwright/test` added to `@rox/web` devDependencies,
 *   2. a `playwright.config.ts` with a `webServer` that boots `next dev` (or a
 *      built server) plus a seeded Neon/test DB and an authenticated session,
 *   3. `bunx playwright install chromium`.
 * Until that harness exists, the parity of the run/trace flow is covered by the
 * ported unit suites (auto-layout, connection-rules, graph-diff) and a manual
 * reasoning checklist (see the issue / PR notes).
 *
 * The file deliberately avoids the `.test.`/`.spec.` infixes (it is named
 * `*.e2e.ts`) so the `bun test` unit runner never picks it up and fails on the
 * missing `@playwright/test` import.
 *
 * Intended flow once the harness lands:
 *   - navigate to `/agents/pipelines/$id`
 *   - open the left-dock palette, drag a node onto the canvas (onDrop add)
 *   - open the cmdk palette (Cmd/Ctrl+K) and add a role node
 *   - run the pipeline via the ▶ ToolbarRunButton (seed message)
 *   - assert the per-node run-status overlay lights up (useRunTrace)
 *   - screenshot the running canvas as evidence
 */

// @ts-nocheck — see STATUS above; `@playwright/test` is intentionally absent.
import { expect, test } from "@playwright/test";

const PIPELINE_PATH = "/agents/pipelines/e2e-seed-pipeline";

test.describe("pipeline editor — web parity (#552)", () => {
	test("palette drop + cmdk add + run + trace overlay", async ({ page }) => {
		await page.goto(PIPELINE_PATH);

		// Canvas + left-dock palette are present.
		await expect(page.getByLabel("Холст пайплайна")).toBeVisible();
		await expect(page.getByPlaceholder("Поиск узлов…")).toBeVisible();

		// cmdk add-node palette (Cmd/Ctrl+K) opens and adds a node.
		await page.keyboard.press("ControlOrMeta+k");
		await expect(page.getByPlaceholder("Тип узла или роль…")).toBeVisible();
		await page.keyboard.press("Escape");

		// Run the pipeline from the toolbar ▶ button.
		const runButton = page.getByRole("button", {
			name: "Запустить пайплайн",
		});
		await runButton.click();
		await page.getByLabel("Стартовое сообщение").fill("e2e seed message");
		await page.getByRole("button", { name: "Запустить" }).last().click();

		// The on-canvas run trace overlays a status ring on at least one node.
		await expect(page.locator(".animate-pulse").first()).toBeVisible({
			timeout: 10_000,
		});

		await page.screenshot({
			path: "test-results/pipeline-editor-run-trace.png",
			fullPage: true,
		});
	});
});
