import { Button } from "@rox/ui/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import { authClient } from "renderer/lib/auth-client";
import { SourceForm, type SourceFormMode } from "./SourceForm";
import { SourcesList } from "./SourcesList";
import type { SourceFormInit } from "./sourceFormState";

/**
 * Connect-a-source management surface (desktop parity port of the web
 * `(agents)/agents/sources/components/SourcesManager/SourcesManager.tsx`): a
 * header with a "Подключить источник" action, the {@link SourcesList}
 * (kind/status + lifecycle transitions), and the {@link SourceForm} create/edit
 * dialog. The active organization comes from the desktop session
 * (`authClient.useSession()` — the same `activeOrganizationId` the workspace
 * stores read), so every list/create/update/setStatus call is org-scoped and the
 * org-admin gate on writes applies. When there is no active org the surface
 * explains why instead of issuing org-less queries.
 */
export function SourcesManager() {
	const { data: session } = authClient.useSession();
	const organizationId = session?.session?.activeOrganizationId ?? undefined;

	const [dialogOpen, setDialogOpen] = useState(false);
	const [formMode, setFormMode] = useState<SourceFormMode>({ mode: "create" });

	const openCreate = () => {
		setFormMode({ mode: "create" });
		setDialogOpen(true);
	};

	const openEdit = (id: string, init: SourceFormInit) => {
		setFormMode({ mode: "edit", id, init });
		setDialogOpen(true);
	};

	if (!organizationId) {
		return (
			<div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
				Выберите организацию, чтобы управлять источниками агентов.
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between gap-4">
				<div>
					<h2 className="font-semibold text-lg">Источники агентов</h2>
					<p className="text-muted-foreground text-sm">
						Подключайте внешние источники и привязывайте их к запускам.
					</p>
				</div>
				<Button type="button" onClick={openCreate}>
					<Plus className="size-4" />
					Подключить источник
				</Button>
			</div>

			<SourcesList organizationId={organizationId} onEdit={openEdit} />

			<SourceForm
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				organizationId={organizationId}
				form={formMode}
			/>
		</div>
	);
}
