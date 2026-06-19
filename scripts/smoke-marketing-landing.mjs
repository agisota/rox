import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const smokeUrl =
	process.env.MARKETING_SMOKE_URL ?? "https://rox-marketing.t/?intro=skip";
const outputDir = process.env.MARKETING_SMOKE_DIR ?? "/tmp";
const chromeChannel = process.env.PLAYWRIGHT_CHANNEL ?? "chrome";

const viewports = [
	{ name: "desktop", width: 1440, height: 1100 },
	{ name: "mobile", width: 390, height: 844 },
];

async function launchBrowser() {
	try {
		return await chromium.launch({ headless: true, channel: chromeChannel });
	} catch (channelError) {
		try {
			return await chromium.launch({ headless: true });
		} catch (defaultError) {
			throw new Error(
				`Unable to launch Playwright Chromium. Tried channel "${chromeChannel}" and bundled Chromium.\nChannel error: ${channelError}\nDefault error: ${defaultError}`,
			);
		}
	}
}

function assertSmoke(condition, message) {
	if (!condition) {
		throw new Error(message);
	}
}

async function captureViewport(viewport) {
	const browser = await launchBrowser();
	const context = await browser.newContext({
		viewport: { width: viewport.width, height: viewport.height },
		ignoreHTTPSErrors: true,
		deviceScaleFactor: 1,
	});
	const page = await context.newPage();

	const response = await page.goto(smokeUrl, {
		waitUntil: "networkidle",
		timeout: 60_000,
	});
	await page.waitForSelector(".rox-landing", {
		state: "visible",
		timeout: 30_000,
	});

	const screenshotPath = join(outputDir, `rox-marketing-${viewport.name}.png`);
	await page.screenshot({ path: screenshotPath, fullPage: false });

	const metrics = await page.evaluate(() => {
		const footer = document.querySelector("footer");
		const cta = document.querySelector(".rox-landing__hero-cta");
		const shell = document.querySelector(".marketing-page-shell");
		const hints = document.querySelector(".rox-hero__hints");
		const footerRect = footer?.getBoundingClientRect();
		const ctaRect = cta?.getBoundingClientRect();
		const footerLinkRows = [
			...new Set(
				Array.from(document.querySelectorAll("footer a"))
					.filter((node) => node.textContent?.trim())
					.map((node) => Math.round(node.getBoundingClientRect().y)),
			),
		];

		return {
			bodyHas500: document.body.textContent?.includes("Internal Server Error"),
			headerCount: document.querySelectorAll("body > header, .marketing-header")
				.length,
			shellPaddingTop: shell ? getComputedStyle(shell).paddingTop : null,
			hintsTag: hints?.tagName ?? null,
			hintCount: document.querySelectorAll(".rox-hero__hint").length,
			footerLinkRows,
			footerLogoCount: document.querySelectorAll('footer a[href="/"] img')
				.length,
			ctaFooterGap:
				ctaRect && footerRect
					? Math.round(footerRect.top - ctaRect.bottom)
					: null,
		};
	});

	await browser.close();

	return {
		viewport: viewport.name,
		status: response?.status(),
		screenshotPath,
		metrics,
	};
}

await mkdir(outputDir, { recursive: true });

const results = [];
for (const viewport of viewports) {
	const result = await captureViewport(viewport);
	results.push(result);

	assertSmoke(result.status === 200, `${viewport.name}: expected HTTP 200`);
	assertSmoke(
		!result.metrics.bodyHas500,
		`${viewport.name}: page contains 500 copy`,
	);
	assertSmoke(
		result.metrics.headerCount === 0,
		`${viewport.name}: header is visible`,
	);
	assertSmoke(
		result.metrics.shellPaddingTop === "0px",
		`${viewport.name}: landing shell still has top padding`,
	);
	assertSmoke(
		result.metrics.hintsTag === "UL",
		`${viewport.name}: hints are not a UL`,
	);
	assertSmoke(
		result.metrics.hintCount === 4,
		`${viewport.name}: expected 4 hints`,
	);
	assertSmoke(
		result.metrics.footerLinkRows.length === 1,
		`${viewport.name}: footer links are not in one row`,
	);
	assertSmoke(
		result.metrics.footerLogoCount === 1,
		`${viewport.name}: footer logo is missing`,
	);
	assertSmoke(
		typeof result.metrics.ctaFooterGap === "number" &&
			result.metrics.ctaFooterGap > 24,
		`${viewport.name}: CTA overlaps or crowds footer`,
	);
}

console.log(JSON.stringify({ smokeUrl, results }, null, 2));
