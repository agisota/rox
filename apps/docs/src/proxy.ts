import { type NextRequest, NextResponse } from "next/server";

/**
 * SITE_GATE — private-preview HTTP Basic auth gate (ROX-519).
 *
 * When `SITE_GATE` is set to `"user:pass"`, every request must carry matching
 * Basic credentials or it gets a 401 + `WWW-Authenticate: Basic` challenge.
 * When unset, this is a no-op and the docs site stays public.
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

export default function proxy(req: NextRequest) {
	const gate = siteGate(req);
	if (gate) return gate;

	return NextResponse.next();
}

export const config = {
	matcher: [
		// Run on every path except Next.js static assets and image optimizer.
		"/((?!_next/static|_next/image|favicon.ico).*)",
	],
};
