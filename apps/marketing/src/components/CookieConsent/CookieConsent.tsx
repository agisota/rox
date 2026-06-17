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
					initial={{ y: 24, opacity: 0, scale: 0.98 }}
					animate={{ y: 0, opacity: 1, scale: 1 }}
					exit={{ y: 16, opacity: 0, scale: 0.98 }}
					transition={{ type: "spring", damping: 26, stiffness: 320 }}
					role="dialog"
					aria-label="Согласие на использование cookies"
					className="fixed inset-x-4 bottom-4 z-50 sm:inset-x-auto sm:bottom-6 sm:left-6 sm:max-w-sm"
				>
					<div className="rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-2xl shadow-black/50 backdrop-blur-xl">
						<div className="flex items-start gap-3">
							<span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-[#ff9a4d]">
								<svg
									width="18"
									height="18"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.8"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5Z" />
									<circle cx="9.5" cy="10" r="0.6" fill="currentColor" />
									<circle cx="14" cy="13.5" r="0.6" fill="currentColor" />
									<circle cx="10" cy="15.5" r="0.6" fill="currentColor" />
								</svg>
							</span>
							<div className="space-y-1">
								<p className="text-sm font-semibold text-white">
									Только аналитика, без рекламы
								</p>
								<p className="text-[13px] leading-relaxed text-white/55">
									Используем аналитические cookies, чтобы делать ROX лучше.
									Никакого трекинга ради рекламы.
								</p>
							</div>
						</div>
						<div className="mt-4 flex items-center gap-2.5">
							<Button
								variant="outline"
								onClick={handleOptOut}
								className="h-10 flex-1 border-white/15 bg-transparent text-white/80 hover:bg-white/5 hover:text-white"
							>
								Отклонить
							</Button>
							<Button
								onClick={handleAccept}
								className="h-10 flex-1 bg-brand text-white hover:bg-brand-dark"
							>
								Принять
							</Button>
						</div>
						<Link
							href="/legal#privacy"
							className="mt-3 block text-center text-xs text-white/40 underline-offset-4 transition-colors hover:text-white/70 hover:underline"
						>
							Политика приватности
						</Link>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
