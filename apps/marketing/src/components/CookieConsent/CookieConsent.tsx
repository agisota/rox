"use client";

import { Button } from "@rox/ui/button";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import posthog from "posthog-js";
import { useEffect, useState } from "react";

import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";

export function CookieConsent() {
	const [showBanner, setShowBanner] = useState(false);

	useEffect(() => {
		const consent = localStorage.getItem(ANALYTICS_CONSENT_KEY);
		if (consent === null) {
			setShowBanner(true);
		}
	}, []);

	const handleAccept = () => {
		localStorage.setItem(ANALYTICS_CONSENT_KEY, "accepted");
		setShowBanner(false);
		posthog.opt_in_capturing();
	};

	const handleOptOut = () => {
		localStorage.setItem(ANALYTICS_CONSENT_KEY, "declined");
		posthog.opt_out_capturing();
		setShowBanner(false);
	};

	return (
		<AnimatePresence>
			{showBanner && (
				<motion.div
					initial={{ y: 20, opacity: 0 }}
					animate={{ y: 0, opacity: 1 }}
					exit={{ y: 20, opacity: 0 }}
					transition={{ type: "spring", damping: 25, stiffness: 300 }}
					className="fixed bottom-4 left-4 z-50 max-w-sm rounded-lg border border-border bg-card p-4 shadow-lg"
				>
					<p className="text-sm text-muted-foreground">
						Мы используем только аналитические cookies, чтобы улучшать продукт.
					</p>
					<div className="mt-4 flex flex-col gap-3">
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								onClick={handleOptOut}
								className="flex-1"
							>
								Отклонить
							</Button>
							<Button onClick={handleAccept} className="flex-1">
								Принять
							</Button>
						</div>
						<Button
							variant="link"
							asChild
							className="h-auto justify-start px-0 text-muted-foreground"
						>
							<Link href="/privacy">Политика приватности</Link>
						</Button>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
