import { auth } from "@rox/auth/server";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

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
];

function matchesRoute(pathname: string, route: string): boolean {
	return pathname === route || pathname.startsWith(`${route}/`);
}

function isPublicRoute(pathname: string): boolean {
	return publicRoutes.some((route) => matchesRoute(pathname, route));
}

export default async function proxy(req: NextRequest) {
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
