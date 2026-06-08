import { type NextRequest, NextResponse } from "next/server";

// Private-preview gate: while Rox is being finished, require basic-auth
// (SITE_GATE="user:pass") for all pages. Unset SITE_GATE to make public.
export default function proxy(req: NextRequest) {
	const gate = process.env.SITE_GATE;
	if (!gate) return NextResponse.next();
	const authz = req.headers.get("authorization");
	const ok = authz?.startsWith("Basic ") && atob(authz.slice(6)) === gate;
	if (ok) return NextResponse.next();
	return new NextResponse("Rox is in private preview.", {
		status: 401,
		headers: { "WWW-Authenticate": 'Basic realm="Rox private preview"' },
	});
}

export const config = {
	matcher: [
		"/((?!_next|ingest|favicon.ico|[^?]*\\.(?:css|js|png|jpe?g|webp|svg|gif|ico|ttf|woff2?|webmanifest|xml|txt)).*)",
	],
};
