import { auth } from "@rox/auth/server";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

/**
 * SITE_GATE — private-preview HTTP Basic auth gate (ROX-519).
 *
 * When `SITE_GATE` is set to `"user:pass"`, every request must carry matching
 * Basic credentials or it gets a 401 + `WWW-Authenticate: Basic` challenge.
 * When unset, this is a no-op and the site stays public. This runs BEFORE the
 * session logic so the whole app sits behind the gate during private preview.
 */
function siteGate(req: NextRequest): NextResponse | null {
	const expected = process.env.SITE_GATE;
	if (!expected) return null;

	const header = req.headers.get("authorization");
	if (header?.startsWith("Basic ")) {
		const provided = atob(header.slice("Basic ".length));
		if (provided === expected) return null;
	}

	return new NextResponse("Authentication required", {
		status: 401,
		headers: {
			"WWW-Authenticate": 'Basic realm="Rox private preview", charset="UTF-8"',
		},
	});
}

/**
 * Brand-reserved handles (see RESERVED_HANDLES in @rox/shared) that have no
 * claimable in-product profile, so `/@<handle>` would `notFound()`. STOPGAP:
 * until a real in-product `@rox` profile exists, point these at the founder's
 * GitHub so the marketing/QR links resolve instead of 404ing. Lowercase keys;
 * lookups normalize case. Remove the matching entry once a profile ships.
 */
const BRAND_HANDLE_REDIRECTS: ReadonlyMap<string, string> = new Map([
	["rox", "https://github.com/agisota"],
	["rox_one", "https://github.com/agisota"],
	["roxone", "https://github.com/agisota"],
]);

/**
 * If `pathname` is a brand-reserved handle route (`/@rox`, `/@rox_one`,
 * `/@roxone`, bare or with a sub-path like `/@rox/skills`), return a 307
 * redirect to its external target; otherwise `null`. Matches only the handle
 * segment (case-insensitive) so unrelated handles like `/@roxfoo` fall through.
 */
function brandHandleRedirect(pathname: string): NextResponse | null {
	if (!pathname.startsWith("/@")) return null;
	// Strip the leading "/@", then take the first path segment as the handle.
	const handle = pathname.slice(2).split("/", 1)[0]?.toLowerCase();
	if (!handle) return null;
	const target = BRAND_HANDLE_REDIRECTS.get(handle);
	if (!target) return null;
	return NextResponse.redirect(new URL(target), 307);
}

const publicRoutes = [
	"/sign-in",
	"/sign-up",
	"/auth/desktop",
	"/api/auth/desktop",
	"/accept-invitation",
	"/cli/auth/code",
	// Public chat/artifact shares (/s/<slug>) — anonymous viewers must reach the
	// share page without being bounced to /sign-in. The page itself is a public
	// DB read (app/s/[slug]/page.tsx). Do NOT remove without breaking sharing.
	// `matchesRoute` is prefix-based, so this also covers the dedicated published-
	// note namespace `/s/note/<slug>` (app/s/note/[slug]/page.tsx).
	"/s",
	// Legacy public user profiles (/u/<handle>) — kept public because it now
	// permanently redirects to the canonical `/@<handle>` form.
	// (app/u/[handle]/page.tsx). Do NOT remove without breaking public profiles.
	"/u",
];

function matchesRoute(pathname: string, route: string): boolean {
	return pathname === route || pathname.startsWith(`${route}/`);
}

/**
 * The public `@<handle>` namespace (ROX-522): profiles, sections, skills and
 * shared resources at `/@<handle>/…`. Anonymous viewers must reach these
 * without being bounced to /sign-in (the pages themselves gate on `isPublic`
 * and `notFound()` for unknown/private/reserved handles). Marketing redirects
 * `rox.one/@<handle>` here.
 */
function isPublicHandleRoute(pathname: string): boolean {
	return pathname.startsWith("/@");
}

function isPublicRoute(pathname: string): boolean {
	return (
		isPublicHandleRoute(pathname) ||
		publicRoutes.some((route) => matchesRoute(pathname, route))
	);
}

export default async function proxy(req: NextRequest) {
	const gate = siteGate(req);
	if (gate) return gate;

	// EARLY brand-handle redirect: must run before the public-handle/auth logic
	// below so it intercepts before the `[handle]` route's `notFound()`.
	const brandRedirect = brandHandleRedirect(req.nextUrl.pathname);
	if (brandRedirect) return brandRedirect;

	const session = await auth.api.getSession({
		headers: await headers(),
	});

	const pathname = req.nextUrl.pathname;

	if (
		session &&
		(matchesRoute(pathname, "/sign-in") || matchesRoute(pathname, "/sign-up"))
	) {
		return NextResponse.redirect(new URL("/", req.url));
	}

	if (!session && !isPublicRoute(pathname)) {
		const signInUrl = new URL("/sign-in", req.url);
		signInUrl.searchParams.set("redirect", pathname + req.nextUrl.search);
		return NextResponse.redirect(signInUrl);
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		"/((?!_next|ingest|monitoring|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
		"/(api|trpc)(.*)",
	],
};
