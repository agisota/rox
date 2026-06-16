import { chatServiceTrpc } from "@rox/chat/client";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
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
	const [selectedModel, setSelectedModel] = useState("");
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
		setSelectedModel(config.modelId);
		if (config.modelId) {
			setDiscoveredModels((current) =>
				current.includes(config.modelId)
					? current
					: [config.modelId, ...current],
			);
		}
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
	const canDiscover =
		baseUrl.trim().length > 0 &&
		(effectiveApiKey.length > 0 || hasSavedApiKey) &&
		!isDiscovering;

	const discoverModels = async () => {
		const trimmedBaseUrl = baseUrl.trim();
		if (!trimmedBaseUrl) {
			toast.error("Укажите Base URL.");
			return;
		}
		// Require a key only when none is saved yet. When a key is already stored,
		// the backend reuses it — the renderer never receives the raw secret, so
		// re-typing it just to re-list models is unnecessary friction.
		if (!effectiveApiKey && !hasSavedApiKey) {
			toast.error("Укажите ключ API.");
			return;
		}

		try {
			const result = await discoverModelsMutation.mutateAsync({
				baseUrl: trimmedBaseUrl,
				// Omit the key when the field is empty so the backend reuses the
				// saved one; send the typed value when the user is changing it.
				...(effectiveApiKey ? { apiKey: effectiveApiKey } : {}),
			});
			const ids = result.models.map((model) => model.id);
			setDiscoveredModels(ids);
			if (ids.length === 0) {
				toast.warning("Эндпоинт не вернул ни одной модели.");
				return;
			}
			if (!ids.includes(selectedModel)) {
				setSelectedModel(ids[0] ?? "");
			}
			toast.success(`Найдено моделей: ${ids.length}`);
		} catch (error) {
			toast.error(getErrorMessage(error, "Не удалось обнаружить модели."));
		}
	};

	const saveConfig = async () => {
		const trimmedBaseUrl = baseUrl.trim();
		const trimmedModel = selectedModel.trim();
		if (!trimmedBaseUrl) {
			toast.error("Укажите Base URL.");
			return;
		}
		if (!effectiveApiKey && !hasSavedApiKey) {
			toast.error("Укажите ключ API.");
			return;
		}
		if (!trimmedModel) {
			toast.error("Выберите модель.");
			return;
		}
		// When the key field is empty but a key is already saved, the user only
		// changed the model/base URL — the backend reuses the stored secret, so we
		// persist without re-entering it.

		try {
			await setConfigMutation.mutateAsync({
				baseUrl: trimmedBaseUrl,
				// Omit the key when the field is empty so the backend keeps the saved
				// one; send the typed value only when the user changed it.
				...(effectiveApiKey ? { apiKey: effectiveApiKey } : {}),
				modelId: trimmedModel,
			});
			setApiKey("");
			await refetch();
			toast.success("Свой провайдер сохранён");
		} catch (error) {
			toast.error(getErrorMessage(error, "Не удалось сохранить."));
		}
	};

	const clearConfig = async () => {
		try {
			await clearConfigMutation.mutateAsync();
			setBaseUrl("");
			setApiKey("");
			setSelectedModel("");
			setDiscoveredModels([]);
			await refetch();
			toast.success("Свой провайдер удалён");
		} catch (error) {
			toast.error(getErrorMessage(error, "Не удалось удалить."));
		}
	};

	return (
		<SettingsSection
			title="Свой провайдер"
			icon={<HiOutlineCube className="size-4" />}
			description="Подключите любой OpenAI-совместимый эндпоинт: укажите Base URL и ключ API, затем обнаружьте доступные модели."
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
						disabled={isSaving}
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
						disabled={isSaving}
					/>
				</div>

				<div className="space-y-1.5">
					<Label
						htmlFor="custom-provider-model"
						className="text-sm font-medium"
					>
						Модель
					</Label>
					<div className="flex items-center gap-2">
						<div className="min-w-0 flex-1">
							<Select
								value={selectedModel || undefined}
								onValueChange={setSelectedModel}
								disabled={discoveredModels.length === 0 || isSaving}
							>
								<SelectTrigger
									id="custom-provider-model"
									className="w-full font-mono"
								>
									<SelectValue
										placeholder={
											discoveredModels.length === 0
												? "Сначала обнаружьте модели"
												: "Выберите модель"
										}
									/>
								</SelectTrigger>
								<SelectContent>
									{discoveredModels.map((modelId) => (
										<SelectItem
											key={modelId}
											value={modelId}
											className="font-mono"
										>
											{modelId}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								void discoverModels();
							}}
							disabled={!canDiscover}
						>
							{isDiscovering ? "Обнаружение…" : "Обнаружить модели"}
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">
						Список запрашивается по адресу{" "}
						<span className="font-mono">{"{Base URL}/models"}</span>{" "}
						(OpenAI-совместимо). Ключ сохраняется в локальном хранилище Rox.
					</p>
				</div>

				<div className="flex items-center justify-end gap-2">
					{hasSavedApiKey ? (
						<Button
							variant="outline"
							size="sm"
							onClick={() => {
								void clearConfig();
							}}
							disabled={isSaving}
						>
							Очистить
						</Button>
					) : null}
					<Button
						size="sm"
						onClick={() => {
							void saveConfig();
						}}
						disabled={isSaving || selectedModel.trim().length === 0}
					>
						Сохранить
					</Button>
				</div>
			</div>
		</SettingsSection>
	);
}
