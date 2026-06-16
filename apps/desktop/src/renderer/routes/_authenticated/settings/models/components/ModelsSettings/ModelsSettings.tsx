import { chatServiceTrpc } from "@rox/chat/client";
import { ModelSelectorLogo } from "@rox/ui/ai-elements/model-selector";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@rox/ui/collapsible";
import { claudeIcon } from "@rox/ui/icons/preset-icons";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { toast } from "@rox/ui/sonner";
import { Textarea } from "@rox/ui/textarea";
import { useEffect, useMemo, useState } from "react";
import { HiChevronDown } from "react-icons/hi2";
import { AnthropicOAuthDialog } from "renderer/components/Chat/ChatInterface/components/ModelPicker/components/AnthropicOAuthDialog";
import { OpenAIOAuthDialog } from "renderer/components/Chat/ChatInterface/components/ModelPicker/components/OpenAIOAuthDialog";
import { useAnthropicOAuth } from "renderer/components/Chat/ChatInterface/components/ModelPicker/hooks/useAnthropicOAuth";
import { useOpenAIOAuth } from "renderer/components/Chat/ChatInterface/components/ModelPicker/hooks/useOpenAIOAuth";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { ApiKeyProviderSection } from "./components/ApiKeyProviderSection";
import { ConfigRow } from "./components/ConfigRow";
import { CustomProviderSection } from "./components/CustomProviderSection";
import { SettingsSection } from "./components/SettingsSection";
import {
	API_KEY_PROVIDER_CONFIGS,
	buildAnthropicEnvText,
	EMPTY_ANTHROPIC_FORM,
	getProviderAction,
	getStatusBadge,
	parseAnthropicForm,
	ROX_PROVIDER_DETAILS,
	ROX_PROVIDER_STATUS,
	resolveProviderStatus,
} from "./utils";

interface ModelsSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

const DIALOG_CONTEXT = {
	isModelSelectorOpen: true,
	onModelSelectorOpenChange: () => {},
} as const;

const STATUS_BADGE_LABELS: Record<string, string> = {
	"Not connected": "Не подключено",
	Expired: "Истекло",
	"Needs attention": "Требует внимания",
	Active: "Активно",
};

export function ModelsSettings({ visibleItems }: ModelsSettingsProps) {
	const showRox = isItemVisible(SETTING_ITEM_ID.MODELS_ROX, visibleItems);
	const showAnthropic = isItemVisible(
		SETTING_ITEM_ID.MODELS_ANTHROPIC,
		visibleItems,
	);
	const showOpenAI = isItemVisible(SETTING_ITEM_ID.MODELS_OPENAI, visibleItems);
	const showCustom = isItemVisible(SETTING_ITEM_ID.MODELS_CUSTOM, visibleItems);
	const visibleApiKeyProviderConfigs = API_KEY_PROVIDER_CONFIGS.filter(
		(config) => {
			switch (config.id) {
				case "groq":
					return isItemVisible(SETTING_ITEM_ID.MODELS_GROQ, visibleItems);
				case "google":
					return isItemVisible(SETTING_ITEM_ID.MODELS_GOOGLE, visibleItems);
				case "deepseek":
					return isItemVisible(SETTING_ITEM_ID.MODELS_DEEPSEEK, visibleItems);
			}
			return false;
		},
	);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [openAIApiKeyInput, setOpenAIApiKeyInput] = useState("");
	const [anthropicApiKeyInput, setAnthropicApiKeyInput] = useState("");
	const [anthropicForm, setAnthropicForm] = useState(EMPTY_ANTHROPIC_FORM);

	const { data: anthropicAuthStatus, refetch: refetchAnthropicAuthStatus } =
		chatServiceTrpc.auth.getAnthropicStatus.useQuery();
	const { data: openAIAuthStatus, refetch: refetchOpenAIAuthStatus } =
		chatServiceTrpc.auth.getOpenAIStatus.useQuery();
	const { data: anthropicEnvConfig, refetch: refetchAnthropicEnvConfig } =
		chatServiceTrpc.auth.getAnthropicEnvConfig.useQuery();
	const setAnthropicApiKeyMutation =
		chatServiceTrpc.auth.setAnthropicApiKey.useMutation();
	const clearAnthropicApiKeyMutation =
		chatServiceTrpc.auth.clearAnthropicApiKey.useMutation();
	const setAnthropicEnvConfigMutation =
		chatServiceTrpc.auth.setAnthropicEnvConfig.useMutation();
	const clearAnthropicEnvConfigMutation =
		chatServiceTrpc.auth.clearAnthropicEnvConfig.useMutation();
	const setOpenAIApiKeyMutation =
		chatServiceTrpc.auth.setOpenAIApiKey.useMutation();
	const clearOpenAIApiKeyMutation =
		chatServiceTrpc.auth.clearOpenAIApiKey.useMutation();

	const {
		isStartingOAuth: isStartingAnthropicOAuth,
		startAnthropicOAuth,
		oauthDialog: anthropicOAuthDialog,
	} = useAnthropicOAuth({
		...DIALOG_CONTEXT,
		onAuthStateChange: async () => {
			await refetchAnthropicAuthStatus();
		},
	});
	const {
		isStartingOAuth: isStartingOpenAIOAuth,
		startOpenAIOAuth,
		oauthDialog: openAIOAuthDialog,
	} = useOpenAIOAuth(DIALOG_CONTEXT);

	const isSavingAnthropicApiKey =
		setAnthropicApiKeyMutation.isPending ||
		clearAnthropicApiKeyMutation.isPending;
	const isSavingAnthropicConfig =
		setAnthropicEnvConfigMutation.isPending ||
		clearAnthropicEnvConfigMutation.isPending;
	const isSavingOpenAIConfig =
		setOpenAIApiKeyMutation.isPending || clearOpenAIApiKeyMutation.isPending;

	useEffect(() => {
		setAnthropicForm(parseAnthropicForm(anthropicEnvConfig?.envText ?? ""));
		setAnthropicApiKeyInput("");
	}, [anthropicEnvConfig?.envText]);

	const anthropicStatus = useMemo(
		() =>
			resolveProviderStatus({
				providerId: "anthropic",
				authStatus: anthropicAuthStatus,
			}),
		[anthropicAuthStatus],
	);

	const openAIStatus = useMemo(
		() =>
			resolveProviderStatus({
				providerId: "openai",
				authStatus: openAIAuthStatus,
			}),
		[openAIAuthStatus],
	);

	const anthropicBadge = useMemo(
		() => getStatusBadge(anthropicStatus),
		[anthropicStatus],
	);
	const openAIBadge = useMemo(
		() => getStatusBadge(openAIStatus),
		[openAIStatus],
	);
	const roxBadge = useMemo(() => getStatusBadge(ROX_PROVIDER_STATUS), []);

	const saveAnthropicForm = async (nextForm = anthropicForm) => {
		const envText = buildAnthropicEnvText(nextForm);
		try {
			if (envText) {
				await setAnthropicEnvConfigMutation.mutateAsync({ envText });
			} else {
				await clearAnthropicEnvConfigMutation.mutateAsync();
			}
			await Promise.all([
				refetchAnthropicEnvConfig(),
				refetchAnthropicAuthStatus(),
			]);
			toast.success("Настройки Anthropic обновлены");
			return true;
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Не удалось сохранить",
			);
			return false;
		}
	};

	const handleAnthropicFormBlur = () => {
		const currentEnvText = anthropicEnvConfig?.envText ?? "";
		const nextEnvText = buildAnthropicEnvText(anthropicForm);
		if (currentEnvText.trim() === nextEnvText.trim()) return;
		void saveAnthropicForm(anthropicForm);
	};

	const resetAnthropicAdvanced = () => {
		const nextForm = {
			...anthropicForm,
			authToken: "",
			baseUrl: "",
			extraEnv: "",
		};
		setAnthropicForm(nextForm);
		void saveAnthropicForm(nextForm);
	};

	const hasAdvancedContent =
		anthropicForm.authToken.trim().length > 0 ||
		anthropicForm.baseUrl.trim().length > 0 ||
		anthropicForm.extraEnv.trim().length > 0;

	const saveAnthropicApiKey = async () => {
		const apiKey = anthropicApiKeyInput.trim();
		if (!apiKey) return;
		try {
			await setAnthropicApiKeyMutation.mutateAsync({ apiKey });
			setAnthropicApiKeyInput("");
			await refetchAnthropicAuthStatus();
			toast.success("Ключ API Anthropic обновлён");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Не удалось сохранить",
			);
		}
	};

	const saveOpenAIApiKey = async () => {
		const apiKey = openAIApiKeyInput.trim();
		if (!apiKey) return;
		try {
			await setOpenAIApiKeyMutation.mutateAsync({ apiKey });
			setOpenAIApiKeyInput("");
			await refetchOpenAIAuthStatus();
			toast.success("Ключ API OpenAI обновлён");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Не удалось сохранить",
			);
		}
	};

	const renderProviderAction = ({
		status,
		startOAuth,
		isStartingOAuth,
		onDisconnect,
	}: {
		status: typeof anthropicStatus | typeof openAIStatus;
		startOAuth: () => Promise<void>;
		isStartingOAuth: boolean;
		onDisconnect: () => void;
	}) => {
		const action = getProviderAction(status);
		if (!action) return null;
		if (action.kind === "logout") {
			return (
				<Button variant="outline" size="sm" onClick={onDisconnect}>
					Выйти
				</Button>
			);
		}
		return (
			<Button
				size="sm"
				onClick={() => void startOAuth()}
				disabled={isStartingOAuth}
			>
				{action.kind === "reconnect" ? "Подключить заново" : "Войти"}
			</Button>
		);
	};

	const getStatusBadgeLabel = (label: string) =>
		STATUS_BADGE_LABELS[label] ?? label;

	return (
		<>
			<div className="w-full max-w-4xl p-6">
				<div className="mb-8">
					<h2 className="text-xl font-semibold">Модели</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Управляйте аккаунтами провайдеров, ключами API и переопределениями.
					</p>
				</div>

				<div className="space-y-8">
					{showRox ? (
						<SettingsSection
							title="Rox"
							icon={<ModelSelectorLogo provider="rox" />}
							description="ROX R1 доступна бесплатно и выбрана моделью по умолчанию без настройки."
							action={
								roxBadge ? (
									<Badge variant={roxBadge.variant}>
										{getStatusBadgeLabel(roxBadge.label)}
									</Badge>
								) : null
							}
						>
							<div className="grid gap-3 rounded-md border border-border/60 p-3 text-xs sm:grid-cols-3">
								<div>
									<div className="text-muted-foreground">Модель</div>
									<div className="mt-1 font-mono">
										{ROX_PROVIDER_DETAILS.modelId}
									</div>
								</div>
								<div>
									<div className="text-muted-foreground">Base URL</div>
									<div className="mt-1 break-all font-mono">
										{ROX_PROVIDER_DETAILS.baseUrl}
									</div>
								</div>
								<div>
									<div className="text-muted-foreground">Ключ</div>
									<div className="mt-1 font-mono">
										{ROX_PROVIDER_DETAILS.apiKeyEnv}
									</div>
								</div>
							</div>
						</SettingsSection>
					) : null}

					{showAnthropic ? (
						<SettingsSection
							title="Anthropic"
							icon={<img alt="" className="size-4" src={claudeIcon} />}
							description="Войдите через Claude или используйте ключ API."
							action={
								<div className="flex items-center gap-2">
									{anthropicBadge ? (
										<Badge variant={anthropicBadge.variant}>
											{getStatusBadgeLabel(anthropicBadge.label)}
										</Badge>
									) : null}
									{renderProviderAction({
										status: anthropicStatus,
										startOAuth: startAnthropicOAuth,
										isStartingOAuth: isStartingAnthropicOAuth,
										onDisconnect: async () => {
											if (anthropicStatus?.authMethod === "oauth") {
												anthropicOAuthDialog.onDisconnect();
											} else {
												await clearAnthropicApiKeyMutation.mutateAsync();
												setAnthropicApiKeyInput("");
											}
											await refetchAnthropicAuthStatus();
										},
									})}
								</div>
							}
						>
							<ConfigRow
								title="Ключ API"
								htmlFor="anthropic-api-key"
								field={
									<Input
										id="anthropic-api-key"
										type="password"
										value={anthropicApiKeyInput}
										onChange={(event) => {
											setAnthropicApiKeyInput(event.target.value);
										}}
										placeholder={
											anthropicStatus?.authMethod === "api_key"
												? "Сохранённый ключ API Anthropic"
												: "sk-ant-..."
										}
										className="font-mono"
										disabled={isSavingAnthropicApiKey}
									/>
								}
								onSave={() => {
									void saveAnthropicApiKey();
								}}
								onClear={() => {
									const nextForm = { ...anthropicForm, apiKey: "" };
									void (async () => {
										try {
											await clearAnthropicApiKeyMutation.mutateAsync();
											setAnthropicApiKeyInput("");
											setAnthropicForm(nextForm);
											await refetchAnthropicAuthStatus();
											toast.success("Ключ API Anthropic удалён");
										} catch (error) {
											toast.error(
												error instanceof Error
													? error.message
													: "Не удалось удалить",
											);
										}
									})();
								}}
								showSave={anthropicApiKeyInput.trim().length > 0}
								disableSave={isSavingAnthropicApiKey}
								showClear={anthropicStatus?.authMethod === "api_key"}
								disableClear={isSavingAnthropicApiKey}
							/>

							<Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
								<div className="flex items-center justify-between">
									<CollapsibleTrigger asChild>
										<button
											type="button"
											className="flex items-center gap-1.5 text-left text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
										>
											<HiChevronDown
												className={`size-3.5 transition-transform ${advancedOpen ? "" : "-rotate-90"}`}
											/>
											Дополнительно
										</button>
									</CollapsibleTrigger>
									{advancedOpen && hasAdvancedContent ? (
										<button
											type="button"
											onClick={resetAnthropicAdvanced}
											disabled={isSavingAnthropicConfig}
											className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
										>
											Сбросить
										</button>
									) : null}
								</div>
								<CollapsibleContent className="mt-3 space-y-3">
									<div className="space-y-1.5">
										<Label
											htmlFor="anthropic-auth-token"
											className="text-sm font-medium"
										>
											Токен авторизации
										</Label>
										<Input
											id="anthropic-auth-token"
											type="password"
											value={anthropicForm.authToken}
											onChange={(event) => {
												setAnthropicForm((current) => ({
													...current,
													authToken: event.target.value,
												}));
											}}
											onBlur={handleAnthropicFormBlur}
											placeholder="ANTHROPIC_AUTH_TOKEN"
											className="font-mono"
											disabled={isSavingAnthropicConfig}
										/>
									</div>
									<div className="space-y-1.5">
										<Label
											htmlFor="anthropic-base-url"
											className="text-sm font-medium"
										>
											Base URL
										</Label>
										<Input
											id="anthropic-base-url"
											value={anthropicForm.baseUrl}
											onChange={(event) => {
												setAnthropicForm((current) => ({
													...current,
													baseUrl: event.target.value,
												}));
											}}
											onBlur={handleAnthropicFormBlur}
											placeholder="https://api.anthropic.com"
											className="font-mono"
											disabled={isSavingAnthropicConfig}
										/>
									</div>
									<div className="space-y-1.5">
										<Label
											htmlFor="anthropic-extra-env"
											className="text-sm font-medium"
										>
											Дополнительные переменные окружения
										</Label>
										<Textarea
											id="anthropic-extra-env"
											value={anthropicForm.extraEnv}
											onChange={(event) => {
												setAnthropicForm((current) => ({
													...current,
													extraEnv: event.target.value,
												}));
											}}
											onBlur={handleAnthropicFormBlur}
											placeholder={
												"CLAUDE_CODE_USE_BEDROCK=1\nAWS_REGION=us-east-1"
											}
											className="min-h-24 font-mono text-xs"
											disabled={isSavingAnthropicConfig}
										/>
									</div>
									<p className="text-xs text-muted-foreground">
										Сохраняется при потере фокуса.
									</p>
								</CollapsibleContent>
							</Collapsible>
						</SettingsSection>
					) : null}

					{showOpenAI ? (
						<SettingsSection
							title="OpenAI"
							icon={
								<img
									alt=""
									className="size-4 dark:invert"
									src="https://models.dev/logos/openai.svg"
								/>
							}
							description="Войдите через ChatGPT или используйте ключ API."
							action={
								<div className="flex items-center gap-2">
									{openAIBadge ? (
										<Badge variant={openAIBadge.variant}>
											{getStatusBadgeLabel(openAIBadge.label)}
										</Badge>
									) : null}
									{renderProviderAction({
										status: openAIStatus,
										startOAuth: startOpenAIOAuth,
										isStartingOAuth: isStartingOpenAIOAuth,
										onDisconnect: async () => {
											if (openAIStatus?.authMethod === "oauth") {
												openAIOAuthDialog.onDisconnect();
											} else {
												await clearOpenAIApiKeyMutation.mutateAsync();
												setOpenAIApiKeyInput("");
											}
											await refetchOpenAIAuthStatus();
										},
									})}
								</div>
							}
						>
							<ConfigRow
								title="Ключ API"
								htmlFor="openai-api-key"
								field={
									<Input
										id="openai-api-key"
										type="password"
										value={openAIApiKeyInput}
										onChange={(event) => {
											setOpenAIApiKeyInput(event.target.value);
										}}
										placeholder={
											openAIStatus?.authMethod === "api_key"
												? "Сохранённый ключ API OpenAI"
												: "sk-..."
										}
										className="font-mono"
										disabled={isSavingOpenAIConfig}
									/>
								}
								onSave={() => {
									void saveOpenAIApiKey();
								}}
								onClear={() => {
									void (async () => {
										try {
											await clearOpenAIApiKeyMutation.mutateAsync();
											setOpenAIApiKeyInput("");
											await refetchOpenAIAuthStatus();
											toast.success("Ключ API OpenAI удалён");
										} catch (error) {
											toast.error(
												error instanceof Error
													? error.message
													: "Не удалось удалить",
											);
										}
									})();
								}}
								showSave={openAIApiKeyInput.trim().length > 0}
								disableSave={isSavingOpenAIConfig}
								showClear={openAIStatus?.authMethod === "api_key"}
								disableClear={isSavingOpenAIConfig}
							/>
						</SettingsSection>
					) : null}

					{visibleApiKeyProviderConfigs.map((config) => (
						<ApiKeyProviderSection key={config.id} config={config} />
					))}

					{showCustom ? <CustomProviderSection /> : null}
				</div>
			</div>

			<AnthropicOAuthDialog {...anthropicOAuthDialog} />
			<OpenAIOAuthDialog {...openAIOAuthDialog} />
		</>
	);
}
