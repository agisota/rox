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
	"/s",
	// Public user profiles (/u/<handle>) — anonymous viewers reach a public
	// profile here (e.g. redirected from rox.one/@<handle>). The page gates on
	// `isPublic` and calls notFound() for private/unknown handles
	// (app/u/[handle]/page.tsx). Do NOT remove without breaking public profiles.
	"/u",
];

function matchesRoute(pathname: string, route: string): boolean {
	return pathname === route || pathname.startsWith(`${route}/`);
}

function isPublicRoute(pathname: string): boolean {
	return publicRoutes.some((route) => matchesRoute(pathname, route));
}

export default async function proxy(req: NextRequest) {
	const gate = siteGate(req);
	if (gate) return gate;

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
