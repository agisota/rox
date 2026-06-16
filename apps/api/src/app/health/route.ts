import { NextResponse } from "next/server";

// Public liveness probe for api.rox.one — no auth, no DB access. Used by uptime
// monitors and the desktop "Хосты" connectivity check. Always fresh (never
// statically cached) so it reflects the running deployment.
export function GET() {
	return NextResponse.json(
		{ status: "ok", service: "api", time: new Date().toISOString() },
		{ status: 200 },
	);
}

export const dynamic = "force-dynamic";
