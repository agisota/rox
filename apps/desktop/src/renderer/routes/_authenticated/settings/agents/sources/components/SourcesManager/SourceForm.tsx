import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { toast } from "@rox/ui/sonner";
import { Textarea } from "@rox/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useCloudTrpc as useTRPC } from "renderer/lib/api-trpc-react";
import {
	CONNECTABLE_SOURCE_KINDS,
	type ConnectableSourceKind,
	initSourceFormState,
	isConnectableSourceKind,
	type SourceFormInit,
	type SourceFormState,
	slugifyName,
	toCreateInput,
	toUpdateInput,
	validateSourceForm,
} from "./sourceFormState";

const KIND_LABELS: Record<ConnectableSourceKind, string> = {
	mcp: "MCP-сервер",
	external_http: "Внешний HTTP-агент",
};

export type SourceFormMode =
	| { mode: "create" }
	| { mode: "edit"; id: string; init: SourceFormInit };

type SourceFormProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	organizationId: string;
	form: SourceFormMode;
};

/**
 * Connect/Edit dialog for an Agent-Native source (desktop parity port of the web
 * `(agents)/agents/sources/components/SourcesManager/SourceForm.tsx`). Drives the
 * pure {@link SourceFormState} mapping and dispatches the EXACT cross-platform
 * `agentSource.create` / `agentSource.update` procedures over the cloud tRPC
 * proxy ({@link useTRPC} === `useCloudTrpc`).
 *
 * Credentials entered here are PLAINTEXT and travel up to the router, which
 * AES-encrypts them into `encryptedConfig`; the form never reads or echoes the
 * ciphertext (the `list`/`get` projection omits it), so on edit the credential
 * rows start blank and only re-send when the user re-enters them. Writes are
 * org-admin gated server-side — a non-admin's submit surfaces the router's
 * FORBIDDEN as an inline toast.
 */
export function SourceForm({
	open,
	onOpenChange,
	organizationId,
	form,
}: SourceFormProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const isEdit = form.mode === "edit";

	const [state, setState] = useState<SourceFormState>(() =>
		initSourceFormState(isEdit ? form.init : undefined),
	);
	// Track whether the user hand-edited the slug so auto-slug from name does not
	// stomp a deliberate slug. On edit the slug is pre-filled and treated as dirty.
	const [slugDirty, setSlugDirty] = useState(isEdit);

	const invalidate = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.agentSource.list.queryKey({ organizationId }),
		});

	const createMutation = useMutation(
		trpc.agentSource.create.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Источник подключён");
				onOpenChange(false);
			},
			onError: (error) => {
				toast.error(error.message || "Не удалось подключить источник");
			},
		}),
	);

	const updateMutation = useMutation(
		trpc.agentSource.update.mutationOptions({
			onSuccess: async () => {
				await invalidate();
				toast.success("Источник обновлён");
				onOpenChange(false);
			},
			onError: (error) => {
				toast.error(error.message || "Не удалось обновить источник");
			},
		}),
	);

	const pending = createMutation.isPending || updateMutation.isPending;
	const validationError = useMemo(() => validateSourceForm(state), [state]);

	const setField = <K extends keyof SourceFormState>(
		key: K,
		value: SourceFormState[K],
	) => setState((prev) => ({ ...prev, [key]: value }));

	const onNameChange = (name: string) => {
		setState((prev) => ({
			...prev,
			name,
			slug: slugDirty ? prev.slug : slugifyName(name),
		}));
	};

	const addCredentialRow = () =>
		setState((prev) => ({
			...prev,
			credentials: [...prev.credentials, { key: "", value: "" }],
		}));

	const updateCredentialRow = (
		index: number,
		field: "key" | "value",
		value: string,
	) =>
		setState((prev) => ({
			...prev,
			credentials: prev.credentials.map((row, i) =>
				i === index ? { ...row, [field]: value } : row,
			),
		}));

	const removeCredentialRow = (index: number) =>
		setState((prev) => ({
			...prev,
			credentials: prev.credentials.filter((_, i) => i !== index),
		}));

	const handleSubmit = (event: React.FormEvent) => {
		event.preventDefault();
		if (validationError) return;
		if (form.mode === "edit") {
			updateMutation.mutate(toUpdateInput(state, form.id, organizationId));
		} else {
			createMutation.mutate(toCreateInput(state, organizationId));
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{isEdit ? "Редактировать источник" : "Подключить источник"}
					</DialogTitle>
					<DialogDescription>
						Внешний агент-источник для запусков. Учётные данные шифруются на
						сервере и не возвращаются обратно.
					</DialogDescription>
				</DialogHeader>

				<form className="space-y-4" onSubmit={handleSubmit}>
					<div className="space-y-2">
						<Label htmlFor="source-name">Название</Label>
						<Input
							id="source-name"
							value={state.name}
							onChange={(e) => onNameChange(e.target.value)}
							placeholder="Acme MCP"
							maxLength={120}
							autoFocus
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="source-slug">Slug</Label>
						<Input
							id="source-slug"
							value={state.slug}
							onChange={(e) => {
								setSlugDirty(true);
								setField("slug", e.target.value.toLowerCase());
							}}
							placeholder="acme-mcp"
							autoCapitalize="none"
							autoCorrect="off"
							spellCheck={false}
							maxLength={80}
						/>
						<p className="text-muted-foreground text-xs">
							Строчные латинские буквы, цифры и «-».
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="source-kind">Тип</Label>
						<Select
							value={state.kind}
							onValueChange={(value) => {
								if (isConnectableSourceKind(value)) setField("kind", value);
							}}
						>
							<SelectTrigger id="source-kind">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{CONNECTABLE_SOURCE_KINDS.map((kind) => (
									<SelectItem key={kind} value={kind}>
										{KIND_LABELS[kind]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label htmlFor="source-endpoint">HTTPS-эндпоинт</Label>
						<Input
							id="source-endpoint"
							value={state.endpointUrl}
							onChange={(e) => setField("endpointUrl", e.target.value)}
							placeholder="https://mcp.acme.example/run"
							inputMode="url"
							autoCapitalize="none"
							autoCorrect="off"
							spellCheck={false}
						/>
					</div>

					<div className="space-y-2">
						<Label htmlFor="source-description">Описание</Label>
						<Textarea
							id="source-description"
							value={state.description}
							onChange={(e) => setField("description", e.target.value)}
							placeholder="Назначение источника"
							maxLength={2000}
							rows={2}
						/>
					</div>

					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label>Учётные данные (заголовки)</Label>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								onClick={addCredentialRow}
							>
								<Plus className="size-3.5" />
								Добавить
							</Button>
						</div>
						{state.credentials.length === 0 ? (
							<p className="text-muted-foreground text-xs">
								{isEdit
									? "Оставьте пустым, чтобы сохранить текущие данные."
									: "Например: Authorization → Bearer …"}
							</p>
						) : (
							<div className="space-y-2">
								{state.credentials.map((row, index) => (
									<div
										// biome-ignore lint/suspicious/noArrayIndexKey: credential rows are positional and have no stable id
										key={index}
										className="flex items-center gap-2"
									>
										<Input
											value={row.key}
											onChange={(e) =>
												updateCredentialRow(index, "key", e.target.value)
											}
											placeholder="Authorization"
											autoCapitalize="none"
											autoCorrect="off"
											spellCheck={false}
											className="flex-1"
										/>
										<Input
											value={row.value}
											onChange={(e) =>
												updateCredentialRow(index, "value", e.target.value)
											}
											placeholder="Bearer …"
											type="password"
											autoCapitalize="none"
											autoCorrect="off"
											spellCheck={false}
											className="flex-1"
										/>
										<Button
											type="button"
											size="icon"
											variant="ghost"
											aria-label="Удалить строку"
											onClick={() => removeCredentialRow(index)}
										>
											<Trash2 className="size-3.5" />
										</Button>
									</div>
								))}
							</div>
						)}
					</div>

					{validationError ? (
						<p className="text-destructive text-sm">{validationError}</p>
					) : null}

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={pending}
						>
							Отмена
						</Button>
						<Button
							type="submit"
							disabled={pending || validationError !== null}
						>
							{pending ? "Сохранение…" : isEdit ? "Сохранить" : "Подключить"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
