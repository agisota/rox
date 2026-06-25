import { zodResolver } from "@hookform/resolvers/zod";
import { chatServiceTrpc } from "@rox/chat/client";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@rox/ui/form";
import { Input } from "@rox/ui/input";
import { toast } from "@rox/ui/sonner";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { HiOutlineCube } from "react-icons/hi2";
import { z } from "zod";
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

/**
 * Client-side schema for the custom-provider form. The Base URL gains a real
 * URL check (the tRPC input only enforces `min(1)`), so an invalid endpoint
 * shows an inline error before submit. The key is optional: when omitted the
 * backend reuses the already-saved secret (the renderer never receives it).
 */
const customProviderFormSchema = z.object({
	baseUrl: z
		.string()
		.trim()
		.min(1, "Укажите Base URL.")
		.url("Введите корректный URL (например, https://api.example.com/v1)."),
	apiKey: z.string(),
});

type CustomProviderFormValues = z.infer<typeof customProviderFormSchema>;

const EMPTY_FORM: CustomProviderFormValues = {
	baseUrl: "",
	apiKey: "",
};

export function CustomProviderSection() {
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
	const isBusy = isSaving || isDiscovering;

	const form = useForm<CustomProviderFormValues>({
		resolver: zodResolver(customProviderFormSchema),
		defaultValues: EMPTY_FORM,
		mode: "onChange",
	});

	const hasSavedApiKey = config?.hasApiKey ?? false;

	// Hydrate the form from the persisted config. The API key is never returned
	// to the renderer (only `hasApiKey`); the field stays empty and shows a saved
	// placeholder so the user can keep the stored key or overwrite it. Re-hydrate
	// only when the persisted Base URL changes so user edits aren't clobbered.
	// biome-ignore lint/correctness/useExhaustiveDependencies: sync only on persisted baseUrl change
	useEffect(() => {
		if (!config) return;
		form.reset({ baseUrl: config.baseUrl, apiKey: "" });
		setDiscoveredModels(config.models);
	}, [config?.baseUrl]);

	const status = useMemo(
		() =>
			resolveProviderStatus({
				providerId: "openai",
				authStatus: config?.status,
			}),
		[config?.status],
	);
	const badge = useMemo(() => getStatusBadge(status), [status]);

	/**
	 * Connect (or refresh): parse `/v1/models` and persist the full list. The
	 * picker surfaces every discovered model; Settings no longer asks the user to
	 * pick a single one.
	 */
	const connectAndSave = async (values: CustomProviderFormValues) => {
		const trimmedBaseUrl = values.baseUrl.trim();
		const effectiveApiKey = values.apiKey.trim();

		// Require a key only when none is saved yet. When a key is already stored,
		// the backend reuses it — the renderer never receives the raw secret.
		if (!effectiveApiKey && !hasSavedApiKey) {
			form.setError("apiKey", {
				type: "manual",
				message: "Укажите ключ API.",
			});
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
			form.reset({ baseUrl: trimmedBaseUrl, apiKey: "" });
			await refetch();
			toast.success(`Свой провайдер сохранён — моделей: ${ids.length}`);
		} catch (error) {
			toast.error(getErrorMessage(error, "Не удалось подключиться."));
		}
	};

	const clearConfig = async () => {
		try {
			await clearConfigMutation.mutateAsync();
			form.reset(EMPTY_FORM);
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
			<Form {...form}>
				<form
					className="space-y-3"
					onSubmit={form.handleSubmit(connectAndSave)}
				>
					<FormField
						control={form.control}
						name="baseUrl"
						render={({ field }) => (
							<FormItem className="space-y-1.5">
								<FormLabel className="text-sm font-medium">Base URL</FormLabel>
								<FormControl>
									<Input
										{...field}
										placeholder="https://api.example.com/v1"
										className="font-mono"
										disabled={isBusy}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<FormField
						control={form.control}
						name="apiKey"
						render={({ field }) => (
							<FormItem className="space-y-1.5">
								<FormLabel className="text-sm font-medium">Ключ API</FormLabel>
								<FormControl>
									<Input
										{...field}
										type="password"
										placeholder={
											hasSavedApiKey ? "Сохранённый ключ API" : "sk-..."
										}
										className="font-mono"
										disabled={isBusy}
									/>
								</FormControl>
								<FormMessage />
							</FormItem>
						)}
					/>

					<p className="text-xs text-muted-foreground">
						Список моделей запрашивается по адресу{" "}
						<span className="font-mono">{"{Base URL}/models"}</span>{" "}
						(OpenAI-совместимо). Ключ сохраняется в локальном хранилище Rox.
						{modelCount > 0 ? (
							<>
								{" "}
								Найдено моделей:{" "}
								<span className="font-medium">{modelCount}</span>.
							</>
						) : null}
					</p>

					<div className="flex items-center justify-end gap-2">
						{hasSavedApiKey ? (
							<Button
								type="submit"
								variant="outline"
								size="sm"
								disabled={isBusy}
							>
								{isDiscovering ? "Обновление…" : "Обновить список моделей"}
							</Button>
						) : null}
						{hasSavedApiKey ? (
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => {
									void clearConfig();
								}}
								disabled={isBusy}
							>
								Очистить
							</Button>
						) : null}
						<Button type="submit" size="sm" disabled={isBusy}>
							{isDiscovering || isSaving ? "Подключение…" : primaryLabel}
						</Button>
					</div>
				</form>
			</Form>
		</SettingsSection>
	);
}
