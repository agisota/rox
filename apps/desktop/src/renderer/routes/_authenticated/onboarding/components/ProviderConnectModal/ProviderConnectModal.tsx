import { chatServiceTrpc } from "@rox/chat/client";
import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { Input } from "@rox/ui/input";
import { toast } from "@rox/ui/sonner";
import { type FormEvent, useState } from "react";
import { LuKeyRound } from "react-icons/lu";
import { AnthropicOAuthDialog } from "renderer/components/Chat/ChatInterface/components/ModelPicker/components/AnthropicOAuthDialog";
import { OpenAIOAuthDialog } from "renderer/components/Chat/ChatInterface/components/ModelPicker/components/OpenAIOAuthDialog";
import { useAnthropicOAuth } from "renderer/components/Chat/ChatInterface/components/ModelPicker/hooks/useAnthropicOAuth";
import { useOpenAIOAuth } from "renderer/components/Chat/ChatInterface/components/ModelPicker/hooks/useOpenAIOAuth";
import { track } from "renderer/lib/analytics";

export type Provider = "anthropic" | "openai";

interface ProviderConnectModalProps {
	provider: Provider | null;
	onOpenChange: (open: boolean) => void;
}

export function ProviderConnectModal({
	provider,
	onOpenChange,
}: ProviderConnectModalProps) {
	if (provider === "anthropic") {
		return <AnthropicConnectDialog onOpenChange={onOpenChange} />;
	}
	if (provider === "openai") {
		return <OpenAIConnectDialog onOpenChange={onOpenChange} />;
	}
	return null;
}

function AnthropicConnectDialog({
	onOpenChange,
}: {
	onOpenChange: (open: boolean) => void;
}) {
	const { refetch } = chatServiceTrpc.auth.getAnthropicStatus.useQuery();
	const setApiKey = chatServiceTrpc.auth.setAnthropicApiKey.useMutation();
	const { isStartingOAuth, startAnthropicOAuth, oauthDialog } =
		useAnthropicOAuth({
			isModelSelectorOpen: true,
			onModelSelectorOpenChange: () => {},
			onAuthStateChange: async () => {
				const result = await refetch();
				if (result.data?.authenticated && !result.data.issue) {
					track("onboarding_provider_connected", {
						provider: "anthropic",
						method: "oauth",
					});
					onOpenChange(false);
				}
			},
		});

	const handleApiKeySubmit = async (rawKey: string) => {
		await setApiKey.mutateAsync({ apiKey: rawKey });
		track("onboarding_provider_connected", {
			provider: "anthropic",
			method: "api-key",
		});
		await refetch();
		onOpenChange(false);
	};

	if (oauthDialog.open) {
		return (
			<AnthropicOAuthDialog
				{...oauthDialog}
				onOpenChange={(open) => {
					oauthDialog.onOpenChange(open);
					if (!open) onOpenChange(false);
				}}
			/>
		);
	}

	return (
		<ConnectDialogShell
			title="Подключить Claude Code"
			description="Используйте подписку Anthropic или API-ключ."
			oauthLabel="Продолжить с Claude Pro/Max"
			oauthPreparing={isStartingOAuth || oauthDialog.isPreparing}
			onOAuth={startAnthropicOAuth}
			apiKeyPlaceholder="sk-ant-..."
			apiKeyHelpUrl="https://console.anthropic.com/settings/keys"
			apiKeyHelpLabel="Получить API-ключ на console.anthropic.com →"
			onApiKeySubmit={handleApiKeySubmit}
			onOpenChange={onOpenChange}
		/>
	);
}

function OpenAIConnectDialog({
	onOpenChange,
}: {
	onOpenChange: (open: boolean) => void;
}) {
	const { refetch } = chatServiceTrpc.auth.getOpenAIStatus.useQuery();
	const setApiKey = chatServiceTrpc.auth.setOpenAIApiKey.useMutation();
	const { isStartingOAuth, startOpenAIOAuth, oauthDialog } = useOpenAIOAuth({
		isModelSelectorOpen: true,
		onModelSelectorOpenChange: () => {},
		onAuthStateChange: async () => {
			const result = await refetch();
			if (result.data?.authenticated && !result.data.issue) {
				track("onboarding_provider_connected", {
					provider: "openai",
					method: "oauth",
				});
				onOpenChange(false);
			}
		},
	});

	const handleApiKeySubmit = async (rawKey: string) => {
		await setApiKey.mutateAsync({ apiKey: rawKey });
		track("onboarding_provider_connected", {
			provider: "openai",
			method: "api-key",
		});
		await refetch();
		onOpenChange(false);
	};

	if (oauthDialog.open) {
		return (
			<OpenAIOAuthDialog
				{...oauthDialog}
				onOpenChange={(open) => {
					oauthDialog.onOpenChange(open);
					if (!open) onOpenChange(false);
				}}
			/>
		);
	}

	return (
		<ConnectDialogShell
			title="Подключить Codex"
			description="Используйте подписку ChatGPT или API-ключ."
			oauthLabel="Войти через ChatGPT"
			oauthPreparing={isStartingOAuth}
			onOAuth={startOpenAIOAuth}
			apiKeyPlaceholder="sk-..."
			apiKeyHelpUrl="https://platform.openai.com/api-keys"
			apiKeyHelpLabel="Получить API-ключ на platform.openai.com →"
			onApiKeySubmit={handleApiKeySubmit}
			onOpenChange={onOpenChange}
		/>
	);
}

interface ConnectDialogShellProps {
	title: string;
	description: string;
	oauthLabel: string;
	oauthPreparing: boolean;
	onOAuth: () => undefined | Promise<unknown>;
	apiKeyPlaceholder: string;
	apiKeyHelpUrl: string;
	apiKeyHelpLabel: string;
	onApiKeySubmit: (key: string) => Promise<void>;
	onOpenChange: (open: boolean) => void;
}

function ConnectDialogShell({
	title,
	description,
	oauthLabel,
	oauthPreparing,
	onOAuth,
	apiKeyPlaceholder,
	apiKeyHelpUrl,
	apiKeyHelpLabel,
	onApiKeySubmit,
	onOpenChange,
}: ConnectDialogShellProps) {
	const [mode, setMode] = useState<"choose" | "api-key">("choose");
	const [apiKey, setApiKey] = useState("");
	const [submitting, setSubmitting] = useState(false);

	const handleSubmit = async (e: FormEvent) => {
		e.preventDefault();
		const trimmed = apiKey.trim();
		if (!trimmed) return;
		setSubmitting(true);
		try {
			await onApiKeySubmit(trimmed);
		} catch (err) {
			toast.error(
				err instanceof Error ? err.message : "Не удалось сохранить API-ключ.",
			);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Dialog open onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[420px]">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				{mode === "choose" ? (
					<div className="flex flex-col gap-2">
						<Button
							size="sm"
							onClick={() => void onOAuth()}
							disabled={oauthPreparing}
						>
							{oauthPreparing ? "Подготовка…" : oauthLabel}
						</Button>
						<Button
							size="sm"
							variant="outline"
							onClick={() => setMode("api-key")}
						>
							<LuKeyRound />
							Использовать API-ключ
						</Button>
					</div>
				) : (
					<form onSubmit={handleSubmit} className="flex flex-col gap-3">
						<Input
							type="password"
							autoComplete="off"
							placeholder={apiKeyPlaceholder}
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							disabled={submitting}
							autoFocus
						/>
						<a
							href={apiKeyHelpUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
						>
							{apiKeyHelpLabel}
						</a>
						<div className="flex items-center justify-end gap-2 pt-2">
							<Button
								type="button"
								size="sm"
								variant="ghost"
								onClick={() => setMode("choose")}
								disabled={submitting}
							>
								Назад
							</Button>
							<Button type="submit" size="sm" disabled={submitting}>
								{submitting ? "Сохраняем…" : "Сохранить и подключить"}
							</Button>
						</div>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
