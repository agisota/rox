import { zodResolver } from "@hookform/resolvers/zod";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@rox/ui/collapsible";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@rox/ui/form";
import { Input } from "@rox/ui/input";
import { Textarea } from "@rox/ui/textarea";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { HiChevronDown } from "react-icons/hi2";
import { z } from "zod";
import {
	type AnthropicFormValues,
	buildAnthropicEnvText,
	parseAnthropicForm,
} from "../../utils";

/**
 * RHF schema for the Anthropic advanced env override. `apiKey` is owned by the
 * separate ConfigRow above and is threaded through unchanged so the persisted
 * env text keeps any saved `ANTHROPIC_API_KEY`. `baseUrl` gains an inline URL
 * check (empty allowed — it clears the override).
 */
const anthropicAdvancedSchema = z.object({
	apiKey: z.string(),
	authToken: z.string(),
	baseUrl: z
		.string()
		.trim()
		.refine(
			(value) => value === "" || z.string().url().safeParse(value).success,
			{
				message:
					"Введите корректный URL (например, https://api.anthropic.com).",
			},
		),
	extraEnv: z.string(),
});

interface AnthropicAdvancedFormProps {
	/** Persisted env text from `getAnthropicEnvConfig`. */
	envText: string;
	/** Persist a non-empty env override. */
	onSave: (envText: string) => Promise<boolean>;
	/** Clear the override (no advanced content left). */
	onClear: () => Promise<boolean>;
	disabled: boolean;
}

export function AnthropicAdvancedForm({
	envText,
	onSave,
	onClear,
	disabled,
}: AnthropicAdvancedFormProps) {
	const [advancedOpen, setAdvancedOpen] = useState(false);

	const form = useForm<AnthropicFormValues>({
		resolver: zodResolver(anthropicAdvancedSchema),
		defaultValues: parseAnthropicForm(envText),
		mode: "onChange",
	});

	// Re-hydrate when the persisted env text changes (e.g. after save/clear).
	// biome-ignore lint/correctness/useExhaustiveDependencies: sync only on persisted env change
	useEffect(() => {
		form.reset(parseAnthropicForm(envText));
	}, [envText]);

	const persist = async (values: AnthropicFormValues) => {
		const nextEnvText = buildAnthropicEnvText(values);
		const currentEnvText = buildAnthropicEnvText(parseAnthropicForm(envText));
		if (nextEnvText.trim() === currentEnvText.trim()) return;
		if (nextEnvText) {
			await onSave(nextEnvText);
		} else {
			await onClear();
		}
	};

	// Explicit submit on blur: validate first, persist only the diff. Keeping the
	// blur affordance preserves prior UX while RHF now drives validation/dirty.
	const handleBlur = () => {
		void form.handleSubmit(persist)();
	};

	const resetAdvanced = () => {
		const cleared: AnthropicFormValues = {
			...form.getValues(),
			authToken: "",
			baseUrl: "",
			extraEnv: "",
		};
		form.reset(cleared);
		void persist(cleared);
	};

	const values = form.watch();
	const hasAdvancedContent =
		values.authToken.trim().length > 0 ||
		values.baseUrl.trim().length > 0 ||
		values.extraEnv.trim().length > 0;

	return (
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
						onClick={resetAdvanced}
						disabled={disabled}
						className="text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
					>
						Сбросить
					</button>
				) : null}
			</div>
			<CollapsibleContent className="mt-3">
				<Form {...form}>
					<form className="space-y-3">
						<FormField
							control={form.control}
							name="authToken"
							render={({ field }) => (
								<FormItem className="space-y-1.5">
									<FormLabel className="text-sm font-medium">
										Токен авторизации
									</FormLabel>
									<FormControl>
										<Input
											{...field}
											type="password"
											onBlur={handleBlur}
											placeholder="ANTHROPIC_AUTH_TOKEN"
											className="font-mono"
											disabled={disabled}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="baseUrl"
							render={({ field }) => (
								<FormItem className="space-y-1.5">
									<FormLabel className="text-sm font-medium">
										Base URL
									</FormLabel>
									<FormControl>
										<Input
											{...field}
											onBlur={handleBlur}
											placeholder="https://api.anthropic.com"
											className="font-mono"
											disabled={disabled}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="extraEnv"
							render={({ field }) => (
								<FormItem className="space-y-1.5">
									<FormLabel className="text-sm font-medium">
										Дополнительные переменные окружения
									</FormLabel>
									<FormControl>
										<Textarea
											{...field}
											onBlur={handleBlur}
											placeholder={
												"CLAUDE_CODE_USE_BEDROCK=1\nAWS_REGION=us-east-1"
											}
											className="min-h-24 font-mono text-xs"
											disabled={disabled}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<p className="text-xs text-muted-foreground">
							Сохраняется при потере фокуса.
						</p>
					</form>
				</Form>
			</CollapsibleContent>
		</Collapsible>
	);
}
