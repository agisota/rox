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
];

function isPublicRoute(pathname: string): boolean {
	return publicRoutes.some((route) => pathname.startsWith(route));
}

function gateBlocked(req: NextRequest): NextResponse | null {
	const gate = process.env.SITE_GATE;
	if (!gate) return null;
	const authz = req.headers.get("authorization");
	const ok = authz?.startsWith("Basic ") && atob(authz.slice(6)) === gate;
	if (ok) return null;
	return new NextResponse("Rox is in private preview.", {
		status: 401,
		headers: { "WWW-Authenticate": 'Basic realm="Rox private preview"' },
	});
}

export default async function proxy(req: NextRequest) {
	const blocked = gateBlocked(req);
	if (blocked) return blocked;

	const session = await auth.api.getSession({
		headers: await headers(),
	});

	const pathname = req.nextUrl.pathname;

	if (
		session &&
		(pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up"))
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
