import { chatServiceTrpc } from "@rox/chat/client";
import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { motionDuration, useShouldAnimate } from "@rox/ui/motion";
import { ProbeStatusIndicator } from "@rox/ui/onboarding-wizard-shell";
import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { type FormEvent, useState } from "react";
import { useOnboardingProbeStore } from "../stores/onboarding-probe-store";

export const Route = createFileRoute("/_authenticated/onboarding/credential/")({
	component: OnboardingCredentialPage,
});

/**
 * Probe / credential step (F48, #637). Runs the live `/models` probe against an
 * OpenAI-compatible base URL via the real `probeCustomProviderModels` tRPC
 * procedure (reused from the desktop chat-service — no mock). The outcome is
 * written to the shared {@link useOnboardingProbeStore}, which gates the footer
 * "Continue" (enabled only once the probe succeeds). Skip stays available — the
 * step is non-blocking, matching the rest of onboarding.
 */
function OnboardingCredentialPage() {
	const [baseUrl, setBaseUrl] = useState("");
	const [apiKey, setApiKey] = useState("");
	const shouldAnimate = useShouldAnimate("decorative");

	const probe = useOnboardingProbeStore((s) => s.probe);
	const setProbe = useOnboardingProbeStore((s) => s.setProbe);
	const probeMutation =
		chatServiceTrpc.auth.probeCustomProviderModels.useMutation();

	const canProbe =
		baseUrl.trim().length > 0 &&
		apiKey.trim().length > 0 &&
		!probeMutation.isPending;

	const runProbe = async (e: FormEvent) => {
		e.preventDefault();
		if (!canProbe) return;
		setProbe({ status: "probing" });
		try {
			const result = await probeMutation.mutateAsync({
				baseUrl: baseUrl.trim(),
				apiKey: apiKey.trim(),
			});
			if (result.ok) {
				setProbe({ status: "ok", models: result.models });
			} else {
				setProbe({
					status: "error",
					error: result.error ?? "Не удалось получить список моделей.",
				});
			}
		} catch (error) {
			setProbe({
				status: "error",
				error:
					error instanceof Error
						? error.message
						: "Не удалось получить список моделей.",
			});
		}
	};

	return (
		<motion.form
			onSubmit={runProbe}
			className="flex flex-col gap-4"
			initial={shouldAnimate ? { opacity: 0, y: 8 } : false}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: motionDuration.base }}
		>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="onboarding-probe-base-url">Base URL</Label>
				<Input
					id="onboarding-probe-base-url"
					type="text"
					placeholder="https://api.openai.com/v1"
					value={baseUrl}
					onChange={(e) => setBaseUrl(e.target.value)}
					disabled={probeMutation.isPending}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="onboarding-probe-api-key">Ключ API</Label>
				<Input
					id="onboarding-probe-api-key"
					type="password"
					placeholder="sk-…"
					value={apiKey}
					onChange={(e) => setApiKey(e.target.value)}
					disabled={probeMutation.isPending}
				/>
			</div>
			<div className="flex items-center justify-between gap-4">
				<ProbeStatusIndicator status={probe.status} error={probe.error} />
				<Button type="submit" size="sm" disabled={!canProbe}>
					{probe.status === "ok" ? "Проверить ещё раз" : "Проверить модели"}
				</Button>
			</div>
		</motion.form>
	);
}
