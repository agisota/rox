"use client";

import posthog from "posthog-js";
import { useState } from "react";
import { GlossaryText } from "@/components/GlossaryTerm";
import { track } from "@/lib/analytics";

interface WaitlistFormProps {
	heading?: string;
	description?: string;
}

export function WaitlistForm({ heading, description }: WaitlistFormProps) {
	const [email, setEmail] = useState("");
	const [submitted, setSubmitted] = useState(false);
	const localizedHeading = localizeWaitlistText(heading);
	const localizedDescription = localizeWaitlistText(description);

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!email) return;

		const wasOptedOut = posthog.has_opted_out_capturing();
		if (wasOptedOut) {
			posthog.opt_in_capturing();
		}

		track("waitlist_signup", { email, platform: "windows_linux" });

		if (wasOptedOut) {
			posthog.opt_out_capturing();
		}

		setSubmitted(true);
	}

	if (submitted) {
		return (
			<div>
				<h2 className="mb-2 text-xl font-medium text-foreground">
					Ты в списке!
				</h2>
				<p className="text-sm text-muted-foreground">
					<GlossaryText text="Сообщим, когда поддержка Windows и Linux будет готова." />
				</p>
			</div>
		);
	}

	return (
		<>
			{localizedHeading && (
				<h2 className="mb-2 text-xl font-medium text-foreground">
					{localizedHeading}
				</h2>
			)}
			{localizedDescription && (
				<p className="mb-6 text-sm text-muted-foreground">
					<GlossaryText text={localizedDescription} />
				</p>
			)}
			<form onSubmit={handleSubmit} className="flex flex-col gap-3">
				<input
					type="email"
					required
					aria-label="Электронная почта для листа ожидания"
					placeholder="почта@example.com"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
				/>
				<button
					type="submit"
					className="w-full rounded-lg bg-foreground py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
				>
					Встать в лист ожидания
				</button>
			</form>
		</>
	);
}

function localizeWaitlistText(text: string | undefined) {
	if (!text) return undefined;

	const knownTranslations: Record<string, string> = {
		"Get notified when Rox is available on Windows & Linux.":
			"Сообщим, когда Rox будет доступен на Windows и Linux.",
		"Join the waitlist": "Лист ожидания",
	};

	return knownTranslations[text] ?? text;
}
