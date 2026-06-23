"use client";

import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { MockSession } from "../../../../../mock-data";
import { DashboardPresence } from "../DashboardPresence";

type SessionHeaderProps = {
	backHref: string;
	session: MockSession;
	/** Workspace/dashboard id the live presence room is scoped to. */
	dashboardId: string;
};

export function SessionHeader({
	backHref,
	session,
	dashboardId,
}: SessionHeaderProps) {
	return (
		<div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
			<Button variant="ghost" size="icon-sm" asChild>
				<Link href={backHref} aria-label="Назад">
					<ArrowLeft className="size-4" />
				</Link>
			</Button>
			<h1 className="min-w-0 flex-1 truncate text-sm font-medium">
				{session.title}
			</h1>
			{/* WS-L T10: live "who's here" presence — inert until LiveBlocks keys
			    are configured + the experimental gate opens. */}
			<DashboardPresence dashboardId={dashboardId} />
			<Badge variant="secondary">Предпросмотр</Badge>
		</div>
	);
}
