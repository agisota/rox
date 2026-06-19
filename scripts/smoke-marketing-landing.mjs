import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

const smokeUrl =
	process.env.MARKETING_SMOKE_URL ?? "https://rox-marketing.t/?intro=skip";
const smokeHost = new URL(smokeUrl).hostname;
const outputDir = process.env.MARKETING_SMOKE_DIR ?? "/tmp";
const chromeChannel = process.env.PLAYWRIGHT_CHANNEL ?? "chrome";
const browserArgs = smokeHost.endsWith(".t")
	? [`--host-resolver-rules=MAP ${smokeHost} 127.0.0.1`]
	: [];

const viewports = [
	{ name: "desktop", width: 1440, height: 1100 },
	{ name: "mobile", width: 390, height: 844 },
];

async function launchBrowser() {
	try {
		return await chromium.launch({
			args: browserArgs,
			headless: true,
			channel: chromeChannel,
		});
	} catch (channelError) {
		try {
			return await chromium.launch({ args: browserArgs, headless: true });
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
	await page.waitForTimeout(700);

	const screenshotPath = join(outputDir, `rox-marketing-${viewport.name}.png`);
	await page.screenshot({ path: screenshotPath, fullPage: false });

	const metrics = await page.evaluate(() => {
		const footer = document.querySelector("footer");
		const cta = document.querySelector(".rox-landing__hero-cta");
		const shell = document.querySelector(".marketing-page-shell");
		const hints = document.querySelector(".rox-hero__hints");
		const cookieConsent = document.querySelector("[data-cookie-consent]");
		const footerLogo = document.querySelector('footer a[href="/"] img');
		const footerRect = footer?.getBoundingClientRect();
		const ctaRect = cta?.getBoundingClientRect();
		const cookieRect = cookieConsent?.getBoundingClientRect();
		const footerLogoRect = footerLogo?.getBoundingClientRect();
		const footerLogoOpacity = footerLogo
			? getComputedStyle(footerLogo.closest("a")).opacity
			: null;
		const footerNavLinks = Array.from(
			document.querySelectorAll("footer nav a[data-footer-link]"),
		);
		const footerLinkIds = footerNavLinks.map((node) => node.dataset.footerLink);
		const footerLinkRects = footerNavLinks.map((node) =>
			node.getBoundingClientRect(),
		);
		const footerLinkGaps = footerLinkRects
			.slice(1)
			.map((rect, index) =>
				Math.round(rect.left - footerLinkRects[index].right),
			);
		const footerLinkRows = [
			...new Set(
				Array.from(document.querySelectorAll("footer a"))
					.filter((node) => node.textContent?.trim())
					.map((node) => Math.round(node.getBoundingClientRect().y)),
			),
		];

		return {
			bodyHas500: document.body.textContent?.includes("Internal Server Error"),
			cookieConsentCount: document.querySelectorAll("[data-cookie-consent]")
				.length,
			cookieConsentHeight: cookieRect ? Math.round(cookieRect.height) : null,
			cookieFooterOverlap:
				cookieRect && footerRect
					? Math.max(
							0,
							Math.min(cookieRect.right, footerRect.right) -
								Math.max(cookieRect.left, footerRect.left),
						) *
						Math.max(
							0,
							Math.min(cookieRect.bottom, footerRect.bottom) -
								Math.max(cookieRect.top, footerRect.top),
						)
					: null,
			headerCount: document.querySelectorAll("body > header, .marketing-header")
				.length,
			shellPaddingTop: shell ? getComputedStyle(shell).paddingTop : null,
			hintsTag: hints?.tagName ?? null,
			hintCount: document.querySelectorAll(".rox-hero__hint").length,
			termCount: document.querySelectorAll(".rox-hero__hint .rox-term").length,
			footerLinkIds,
			footerLinkGaps,
			footerNewBadgeCount: document.querySelectorAll(
				'[data-footer-badge="changelog-new"]',
			).length,
			footerLinkRows,
			footerLogoCount: document.querySelectorAll('footer a[href="/"] img')
				.length,
			footerLogoHeight: footerLogoRect
				? Math.round(footerLogoRect.height)
				: null,
			footerLogoOpacity,
			footerLogoBottomGap: footerLogoRect
				? Math.round(window.innerHeight - footerLogoRect.bottom)
				: null,
			footerNavLogoGap:
				footerLogoRect && footerLinkRows.length > 0
					? Math.round(footerLogoRect.top - footerLinkRows[0])
					: null,
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
		result.metrics.cookieConsentCount === 1,
		`${viewport.name}: cookie consent is missing on first visit`,
	);
	assertSmoke(
		typeof result.metrics.cookieConsentHeight === "number" &&
			result.metrics.cookieConsentHeight <=
				(viewport.name === "mobile" ? 110 : 130),
		`${viewport.name}: cookie consent is too tall for the landing page`,
	);
	assertSmoke(
		result.metrics.cookieFooterOverlap === 0,
		`${viewport.name}: cookie consent overlaps the footer`,
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
		result.metrics.termCount >= 6,
		`${viewport.name}: feature terms lost underline/hover targets`,
	);
	assertSmoke(
		result.metrics.footerLinkRows.length === 1,
		`${viewport.name}: footer links are not in one row`,
	);
	assertSmoke(
		result.metrics.footerLinkIds.join(",") === "changelog,docs,legal",
		`${viewport.name}: footer links are in the wrong order`,
	);
	assertSmoke(
		result.metrics.footerNewBadgeCount === 1,
		`${viewport.name}: changelog new badge is missing`,
	);
	assertSmoke(
		result.metrics.footerLinkGaps.every((gap) =>
			viewport.name === "mobile" ? gap >= 14 : gap >= 70,
		),
		`${viewport.name}: footer links are too close together`,
	);
	assertSmoke(
		result.metrics.footerLogoCount === 1,
		`${viewport.name}: footer logo is missing`,
	);
	assertSmoke(
		typeof result.metrics.footerLogoHeight === "number" &&
			result.metrics.footerLogoHeight >= 52,
		`${viewport.name}: footer logo is not enlarged`,
	);
	assertSmoke(
		result.metrics.footerLogoOpacity === "0.5",
		`${viewport.name}: footer logo base opacity is not 50%`,
	);
	assertSmoke(
		typeof result.metrics.footerLogoBottomGap === "number" &&
			result.metrics.footerLogoBottomGap >=
				(viewport.name === "mobile" ? 44 : 52),
		`${viewport.name}: footer logo is still too close to the viewport bottom`,
	);
	assertSmoke(
		typeof result.metrics.footerNavLogoGap === "number" &&
			result.metrics.footerNavLogoGap >= 74,
		`${viewport.name}: footer links and logo are too close together`,
	);
	assertSmoke(
		typeof result.metrics.ctaFooterGap === "number" &&
			result.metrics.ctaFooterGap > 24,
		`${viewport.name}: CTA overlaps or crowds footer`,
	);
}

console.log(JSON.stringify({ smokeUrl, results }, null, 2));
