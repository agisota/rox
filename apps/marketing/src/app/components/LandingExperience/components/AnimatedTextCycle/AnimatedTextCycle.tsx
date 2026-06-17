"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

interface AnimatedTextCycleProps {
	words: ReadonlyArray<string>;
	interval?: number;
	className?: string;
	/** Snappier blur/slide transitions for fast agent cycling. */
	fast?: boolean;
}

export function AnimatedTextCycle({
	words,
	interval = 5000,
	className = "",
	fast = false,
}: AnimatedTextCycleProps) {
	const prefersReducedMotion = useReducedMotion();
	const [currentIndex, setCurrentIndex] = useState(0);
	const [width, setWidth] = useState("auto");
	const measureRef = useRef<HTMLDivElement>(null);
	const measuredWords = useMemo(() => {
		const seen = new Map<string, number>();
		return words.map((word) => {
			const count = seen.get(word) ?? 0;
			seen.set(word, count + 1);
			return { key: `${word}-${count}`, word };
		});
	}, [words]);

	useEffect(() => {
		if (words.length === 0) return;
		if (currentIndex >= words.length) {
			setCurrentIndex(0);
			return;
		}
		if (measureRef.current) {
			const elements = measureRef.current.children;
			const element = elements[currentIndex];
			if (element instanceof HTMLElement) {
				setWidth(`${element.getBoundingClientRect().width}px`);
			}
		}
	}, [currentIndex, words]);

	useEffect(() => {
		if (prefersReducedMotion || words.length <= 1) return;

		const timer = setInterval(() => {
			setCurrentIndex((prevIndex) => (prevIndex + 1) % words.length);
		}, interval);

		return () => clearInterval(timer);
	}, [interval, prefersReducedMotion, words.length]);

	if (words.length === 0) return null;

	const activeWord = words[currentIndex] ?? words[0];

	if (prefersReducedMotion) {
		return <span className={className}>{activeWord}</span>;
	}

	const containerVariants = {
		hidden: {
			y: fast ? -8 : -14,
			opacity: 0,
			filter: fast ? "blur(4px)" : "blur(6px)",
		},
		visible: {
			y: 0,
			opacity: 1,
			filter: "blur(0px)",
			transition: {
				duration: fast ? 0.18 : 0.38,
				ease: "easeOut" as const,
			},
		},
		exit: {
			y: fast ? 8 : 14,
			opacity: 0,
			filter: fast ? "blur(4px)" : "blur(6px)",
			transition: {
				duration: fast ? 0.14 : 0.28,
				ease: "easeIn" as const,
			},
		},
	};

	return (
		<>
			<div
				ref={measureRef}
				className="pointer-events-none absolute opacity-0"
				aria-hidden="true"
			>
				{measuredWords.map((entry) => (
					<span key={entry.key} className={`inline-block ${className}`}>
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
						stiffness: fast ? 220 : 150,
						damping: fast ? 22 : 18,
						mass: fast ? 0.9 : 1.1,
					},
				}}
			>
				<AnimatePresence mode="wait">
					<motion.span
						key={currentIndex}
						className={`inline-block ${className}`}
						variants={containerVariants}
						initial="hidden"
						animate="visible"
						exit="exit"
						style={{ whiteSpace: "nowrap" }}
					>
						{activeWord}
					</motion.span>
				</AnimatePresence>
			</motion.span>
		</>
	);
}
