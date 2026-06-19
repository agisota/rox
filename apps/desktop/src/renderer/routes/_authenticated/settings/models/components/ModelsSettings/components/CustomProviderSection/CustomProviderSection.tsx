import { chatServiceTrpc } from "@rox/chat/client";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { toast } from "@rox/ui/sonner";
import { useEffect, useMemo, useState } from "react";
import { HiOutlineCube } from "react-icons/hi2";
import { getStatusBadge, resolveProviderStatus } from "../../utils";
import { SettingsSection } from "../SettingsSection";

const STATUS_BADGE_LABELS: Record<string, string> = {
	"Not connected": "Не подключено",
	Expired: "Истекло",
	"Needs attention": "Требует внимания",
	Active: "Активно",
};

function getStatusBadgeLabel(label: string): string {
	return STATUS_BADGE_LABELS[label] ?? label;
}

function getErrorMessage(error: unknown, fallback: string): string {
	return error instanceof Error && error.message.trim()
		? error.message
		: fallback;
}

export function CustomProviderSection() {
	const [baseUrl, setBaseUrl] = useState("");
	const [apiKey, setApiKey] = useState("");
	const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);

	const { data: config, refetch } =
		chatServiceTrpc.auth.getCustomProviderConfig.useQuery();
	const discoverModelsMutation =
		chatServiceTrpc.auth.discoverCustomProviderModels.useMutation();
	const setConfigMutation =
		chatServiceTrpc.auth.setCustomProviderConfig.useMutation();
	const clearConfigMutation =
		chatServiceTrpc.auth.clearCustomProviderConfig.useMutation();

	const isSaving = setConfigMutation.isPending || clearConfigMutation.isPending;
	const isDiscovering = discoverModelsMutation.isPending;

	// Hydrate the form from the persisted config. The API key is never returned
	// to the renderer (only `hasApiKey`); the input stays empty and shows a saved
	// placeholder so the user can keep the stored key or overwrite it.
	useEffect(() => {
		if (!config) return;
		setBaseUrl(config.baseUrl);
		setDiscoveredModels(config.models);
	}, [config]);

	const status = useMemo(
		() =>
			resolveProviderStatus({
				providerId: "openai",
				authStatus: config?.status,
			}),
		[config?.status],
	);
	const badge = useMemo(() => getStatusBadge(status), [status]);

	const hasSavedApiKey = config?.hasApiKey ?? false;
	const effectiveApiKey = apiKey.trim();
	const canConnect =
		baseUrl.trim().length > 0 &&
		(effectiveApiKey.length > 0 || hasSavedApiKey) &&
		!isDiscovering &&
		!isSaving;

	/**
	 * Connect (or refresh): parse `/v1/models` and persist the full list. The
	 * picker surfaces every discovered model; Settings no longer asks the user to
	 * pick a single one.
	 */
	const connectAndSave = async () => {
		const trimmedBaseUrl = baseUrl.trim();
		if (!trimmedBaseUrl) {
			toast.error("Укажите Base URL.");
			return;
		}
		// Require a key only when none is saved yet. When a key is already stored,
		// the backend reuses it — the renderer never receives the raw secret.
		if (!effectiveApiKey && !hasSavedApiKey) {
			toast.error("Укажите ключ API.");
			return;
		}

		try {
			const result = await discoverModelsMutation.mutateAsync({
				baseUrl: trimmedBaseUrl,
				// Omit the key when the field is empty so the backend reuses the saved
				// one; send the typed value when the user is changing it.
				...(effectiveApiKey ? { apiKey: effectiveApiKey } : {}),
			});
			const ids = result.models.map((model) => model.id);
			setDiscoveredModels(ids);
			if (ids.length === 0) {
				toast.warning("Эндпоинт не вернул ни одной модели.");
				return;
			}

			await setConfigMutation.mutateAsync({
				baseUrl: trimmedBaseUrl,
				...(effectiveApiKey ? { apiKey: effectiveApiKey } : {}),
				models: ids,
			});
			setApiKey("");
			await refetch();
			toast.success(`Свой провайдер сохранён — моделей: ${ids.length}`);
		} catch (error) {
			toast.error(getErrorMessage(error, "Не удалось подключиться."));
		}
	};

	const clearConfig = async () => {
		try {
			await clearConfigMutation.mutateAsync();
			setBaseUrl("");
			setApiKey("");
			setDiscoveredModels([]);
			await refetch();
			toast.success("Свой провайдер удалён");
		} catch (error) {
			toast.error(getErrorMessage(error, "Не удалось удалить."));
		}
	};

	const modelCount = discoveredModels.length;
	const primaryLabel = hasSavedApiKey ? "Сохранить" : "Подключить";

	return (
		<SettingsSection
			title="Свой провайдер"
			icon={<HiOutlineCube className="size-4" />}
			description="Подключите любой OpenAI-совместимый эндпоинт: укажите Base URL и ключ API. Все доступные модели появятся в выборе модели в чате."
			action={
				badge ? (
					<Badge variant={badge.variant}>
						{getStatusBadgeLabel(badge.label)}
					</Badge>
				) : null
			}
		>
			<div className="space-y-3">
				<div className="space-y-1.5">
					<Label
						htmlFor="custom-provider-base-url"
						className="text-sm font-medium"
					>
						Base URL
					</Label>
					<Input
						id="custom-provider-base-url"
						value={baseUrl}
						onChange={(event) => {
							setBaseUrl(event.target.value);
						}}
						placeholder="https://api.example.com/v1"
						className="font-mono"
						disabled={isSaving || isDiscovering}
					/>
				</div>

				<div className="space-y-1.5">
					<Label
						htmlFor="custom-provider-api-key"
						className="text-sm font-medium"
					>
						Ключ API
					</Label>
					<Input
						id="custom-provider-api-key"
						type="password"
						value={apiKey}
						onChange={(event) => {
							setApiKey(event.target.value);
						}}
						placeholder={hasSavedApiKey ? "Сохранённый ключ API" : "sk-..."}
						className="font-mono"
						disabled={isSaving || isDiscovering}
					/>
				</div>

				<p className="text-xs text-muted-foreground">
					Список моделей запрашивается по адресу{" "}
					<span className="font-mono">{"{Base URL}/models"}</span>{" "}
					(OpenAI-совместимо). Ключ сохраняется в локальном хранилище Rox.
					{modelCount > 0 ? (
						<>
							{" "}
							Найдено моделей: <span className="font-medium">{modelCount}</span>
							.
						</>
					) : null}
				</p>

				<div className="flex items-center justify-end gap-2">
					{hasSavedApiKey ? (
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								void connectAndSave();
							}}
							disabled={!canConnect}
						>
							{isDiscovering ? "Обновление…" : "Обновить список моделей"}
						</Button>
					) : null}
					{hasSavedApiKey ? (
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								void clearConfig();
							}}
							disabled={isSaving || isDiscovering}
						>
							Очистить
						</Button>
					) : null}
					<Button
						size="sm"
						onClick={() => {
							void connectAndSave();
						}}
						disabled={!canConnect}
					>
						{isDiscovering || isSaving ? "Подключение…" : primaryLabel}
					</Button>
				</div>
			</div>
		</SettingsSection>
	);
}
