"use client";

import { authClient } from "@rox/auth/client";
import { ObjectCommentsPanel } from "./ObjectCommentsPanel";
import { resolveThreadsAsObjectsGate } from "./resolveThreadsAsObjectsGate";

export interface ObjectCommentsGateClientProps {
	/**
	 * The object to anchor the thread to (an `entities.id`), taken from the
	 * `?object=` route param. Optional: when absent the surface explains how to
	 * pick an object rather than faking an entity id.
	 */
	entityId?: string;
	/** Optional project scope for a freshly-created thread (`?project=`). */
	v2ProjectId?: string;
}

/**
 * Client gate for the object-comments surface. Reads the active organization from
 * the session and applies the pure {@link resolveThreadsAsObjectsGate} (which
 * reuses the `collaboration.threadsAsObjects` experimental feature). When the
 * gate is closed — no org, kill switch, or a future demote of the feature — the
 * surface stays inert and explains why rather than issuing org-less
 * `graph.comments` calls. The thread is anchored to the `entityId` route param;
 * with no object selected it shows an inert hint instead of inventing an id.
 */
export function ObjectCommentsGateClient({
	entityId,
	v2ProjectId,
}: ObjectCommentsGateClientProps) {
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? undefined;
	const gate = resolveThreadsAsObjectsGate({ organizationId });

	if (!gate.enabled) {
		return (
			<div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
				Комментарии недоступны для текущего контекста.
			</div>
		);
	}

	if (!entityId || entityId.trim() === "") {
		return (
			<div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
				Выберите объект проекта (через единый поиск), чтобы открыть его ветку
				комментариев.
			</div>
		);
	}

	return <ObjectCommentsPanel entityId={entityId} v2ProjectId={v2ProjectId} />;
}
