"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

interface AnimatedTextCycleProps {
	words: ReadonlyArray<string>;
	interval?: number;
	className?: string;
	/** Backward-compatible flag for call sites that opt into fast agent cycling. */
	fast?: boolean;
}

/**
 * Cycling word that animates its wrapper WIDTH (spring) to the CURRENT word's
 * width — so the surrounding copy always sits tight against it instead of being
 * padded out to the widest word. Each word enters with a blur+slide-down and
 * exits with a blur+slide-up (AnimatePresence, mode="wait").
 *
 * Adapted from the thimows / 21st.dev "animated-text-cycle" reference into this
 * repo's named export + existing props (`words`, `interval`, `className`,
 * `fast`). Honours `prefers-reduced-motion` by rendering a static word.
 */
export function AnimatedTextCycle({
	words,
	interval = 5000,
	className = "",
}: AnimatedTextCycleProps) {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [width, setWidth] = useState<number | "auto">("auto");
	const measureRef = useRef<HTMLDivElement>(null);
	const prefersReducedMotion = useReducedMotion();

	// Stable React keys for duplicate words (avoids index keys).
	const measuredWords = useMemo(() => {
		const seen = new Map<string, number>();
		return words.map((word) => {
			const count = seen.get(word) ?? 0;
			seen.set(word, count + 1);
			return { key: `${word}-${count}`, word };
		});
	}, [words]);

	// Measure the CURRENT word and animate the wrapper to that width.
	useLayoutEffect(() => {
		if (words.length === 0) return;
		const node = measureRef.current;
		if (!node) return;
		const child = node.children[currentIndex];
		if (child instanceof HTMLElement) {
			setWidth(child.getBoundingClientRect().width);
		}
	}, [currentIndex, words.length]);

	useEffect(() => {
		if (words.length <= 1) return;
		const timer = setInterval(() => {
			setCurrentIndex((prev) => (prev + 1) % words.length);
		}, interval);
		return () => clearInterval(timer);
	}, [interval, words.length]);

	if (words.length === 0) return null;

	const activeWord = words[currentIndex] ?? words[0];

	// Reduced motion: no width spring, no blur/slide — just swap the text.
	if (prefersReducedMotion) {
		return (
			<span
				className={`inline-block ${className}`}
				style={{ whiteSpace: "nowrap" }}
			>
				{activeWord}
			</span>
		);
	}

	return (
		<>
			{/* Hidden measurement layer: one span per word, same class so the
			    measured width matches the rendered word exactly. */}
			<div
				ref={measureRef}
				aria-hidden="true"
				className="pointer-events-none absolute opacity-0"
				style={{ visibility: "hidden" }}
			>
				{measuredWords.map((entry) => (
					<span
						key={entry.key}
						className={`inline-block ${className}`}
						style={{ whiteSpace: "nowrap" }}
					>
						{entry.word}
					</span>
				))}
			</div>

			<motion.span
				className="relative inline-block align-baseline"
				animate={{
					width,
					transition: {
						type: "spring",
						stiffness: 150,
						damping: 15,
						mass: 1.2,
					},
				}}
			>
				<AnimatePresence mode="wait" initial={false}>
					<motion.span
						key={currentIndex}
						className={`inline-block ${className}`}
						initial={{ y: -16, opacity: 0, filter: "blur(8px)" }}
						animate={{
							y: 0,
							opacity: 1,
							filter: "blur(0px)",
							transition: { duration: 0.4, ease: "easeOut" },
						}}
						exit={{
							y: 16,
							opacity: 0,
							filter: "blur(8px)",
							transition: { duration: 0.3, ease: "easeIn" },
						}}
						style={{ whiteSpace: "nowrap" }}
					>
						{activeWord}
					</motion.span>
				</AnimatePresence>
			</motion.span>
		</>
	);
}
