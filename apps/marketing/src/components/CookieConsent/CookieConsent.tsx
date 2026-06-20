"use client";

import { Button } from "@rox/ui/button";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import posthog from "posthog-js";
import { useEffect, useState } from "react";

import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";

/**
 * On-brand analytics-consent toast: a rounded glass card (backdrop-blur,
 * hairline border, soft shadow) pinned bottom-left, with a subtle fade/slide-in
 * entrance. Matches the landing's dark + warm-amber aesthetic. Keeps all prior
 * behaviour: accept/decline handlers, persistence, the privacy-policy link, and
 * Russian copy. Honours prefers-reduced-motion (no slide).
 */
export function CookieConsent() {
	const [showBanner, setShowBanner] = useState(false);
	const prefersReducedMotion = useReducedMotion();

	useEffect(() => {
		const consent = localStorage.getItem(ANALYTICS_CONSENT_KEY);
		setShowBanner(consent === null);
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

	const enterOffset = prefersReducedMotion ? 0 : 18;

	return (
		<AnimatePresence>
			{showBanner && (
				<motion.div
					initial={{ y: enterOffset, opacity: 0 }}
					animate={{ y: 0, opacity: 1 }}
					exit={{ y: enterOffset, opacity: 0 }}
					transition={{ type: "spring", damping: 28, stiffness: 300 }}
					role="dialog"
					aria-label="Согласие на использование cookies"
					data-cookie-consent
					className="fixed inset-x-4 bottom-4 z-50 sm:inset-x-auto sm:bottom-6 sm:left-6 sm:max-w-[22rem]"
				>
					<div className="overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/70 shadow-2xl shadow-black/50 ring-1 ring-inset ring-white/5 backdrop-blur-2xl">
						{/* Warm amber accent rail */}
						<div className="h-px w-full bg-gradient-to-r from-transparent via-[#ff9a4d]/70 to-transparent" />

						<div className="p-5">
							<div className="flex items-start gap-3">
								<span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#ff9a4d]/12 text-[#ff9a4d] ring-1 ring-inset ring-[#ff9a4d]/20">
									<svg
										width="18"
										height="18"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="1.7"
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
								<div className="min-w-0 space-y-1">
									<p className="text-sm font-semibold tracking-tight text-white">
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
									variant="ghost"
									onClick={handleOptOut}
									className="h-9 flex-1 border border-white/10 bg-transparent text-[13px] text-white/70 hover:bg-white/5 hover:text-white"
								>
									Нет
								</Button>
								<Button
									onClick={handleAccept}
									className="h-9 flex-1 bg-[#f0792a] text-[13px] font-semibold text-white shadow-[0_8px_24px_-8px_rgba(240,121,42,0.6)] hover:bg-[#ff9a4d]"
								>
									ОК
								</Button>
							</div>

							<Link
								href="/legal#privacy"
								className="mt-3 block text-center text-[11px] text-white/40 underline-offset-4 transition-colors hover:text-white/70 hover:underline"
							>
								Политика приватности
							</Link>
						</div>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
