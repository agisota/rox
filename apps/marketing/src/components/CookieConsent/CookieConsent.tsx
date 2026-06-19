"use client";

import { Button } from "@rox/ui/button";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import posthog from "posthog-js";
import { useEffect, useState } from "react";

import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";

export function CookieConsent() {
	const [showBanner, setShowBanner] = useState(true);
	const pathname = usePathname();
	const isLanding = pathname === "/";

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

	return (
		<AnimatePresence initial={false}>
			{showBanner && (
				<motion.div
					initial={false}
					animate={{ y: 0, opacity: 1, scale: 1 }}
					exit={{ y: 16, opacity: 0, scale: 0.98 }}
					transition={{ type: "spring", damping: 26, stiffness: 320 }}
					role="dialog"
					aria-label="Согласие на использование cookies"
					data-cookie-consent
					className={
						isLanding
							? "fixed top-3 left-3 z-50 w-[11rem] sm:top-6 sm:left-6 sm:w-52"
							: "fixed inset-x-4 bottom-4 z-50 sm:inset-x-auto sm:bottom-6 sm:left-6 sm:max-w-sm"
					}
				>
					<div
						className={
							isLanding
								? "rounded-xl border border-white/10 bg-zinc-950/78 p-2.5 shadow-xl shadow-black/35 backdrop-blur-xl"
								: "rounded-2xl border border-white/10 bg-zinc-950/80 p-5 shadow-2xl shadow-black/50 backdrop-blur-xl"
						}
					>
						<div
							className={
								isLanding
									? "flex items-start gap-2 sm:gap-3"
									: "flex items-start gap-3"
							}
						>
							<span
								className={
									isLanding
										? "hidden"
										: "flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-[#ff9a4d]"
								}
							>
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
							<div className={isLanding ? "min-w-0 space-y-0.5" : "space-y-1"}>
								<p
									className={
										isLanding
											? "truncate text-[11px] font-semibold text-white sm:text-xs"
											: "text-sm font-semibold text-white"
									}
								>
									{isLanding
										? "Аналитика без рекламы"
										: "Только аналитика, без рекламы"}
								</p>
								<p
									className={
										isLanding
											? "hidden"
											: "text-[13px] leading-relaxed text-white/55"
									}
								>
									Используем аналитические cookies, чтобы делать ROX лучше.
									Никакого трекинга ради рекламы.
								</p>
							</div>
						</div>
						<div
							className={
								isLanding
									? "mt-2 flex items-center gap-1.5 sm:mt-3 sm:gap-2"
									: "mt-4 flex items-center gap-2.5"
							}
						>
							<Button
								variant="outline"
								size={isLanding ? "xs" : undefined}
								onClick={handleOptOut}
								className={
									isLanding
										? "flex-1 border-white/15 bg-transparent text-[11px] text-white/80 hover:bg-white/5 hover:text-white"
										: "h-10 flex-1 border-white/15 bg-transparent text-white/80 hover:bg-white/5 hover:text-white"
								}
							>
								{isLanding ? "Нет" : "Отклонить"}
							</Button>
							<Button
								size={isLanding ? "xs" : undefined}
								onClick={handleAccept}
								className={
									isLanding
										? "flex-1 bg-brand text-[11px] text-white hover:bg-brand-dark"
										: "h-10 flex-1 bg-brand text-white hover:bg-brand-dark"
								}
							>
								{isLanding ? "ОК" : "Принять"}
							</Button>
						</div>
						<Link
							href="/legal#privacy"
							className={
								isLanding
									? "mt-1.5 block text-center text-[9px] text-white/40 underline-offset-4 transition-colors hover:text-white/70 hover:underline sm:mt-2 sm:text-[11px]"
									: "mt-3 block text-center text-xs text-white/40 underline-offset-4 transition-colors hover:text-white/70 hover:underline"
							}
						>
							Политика приватности
						</Link>
					</div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}
