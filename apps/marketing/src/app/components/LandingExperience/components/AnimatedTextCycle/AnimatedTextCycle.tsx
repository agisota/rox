"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

interface AnimatedTextCycleProps {
	words: ReadonlyArray<string>;
	interval?: number;
	className?: string;
}

export function AnimatedTextCycle({
	words,
	interval = 5000,
	className = "",
}: AnimatedTextCycleProps) {
	const prefersReducedMotion = useReducedMotion();
	const [currentIndex, setCurrentIndex] = useState(0);
	const [width, setWidth] = useState("auto");
	const measureRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (measureRef.current) {
			const elements = measureRef.current.children;
			const element = elements[currentIndex];
			if (element instanceof HTMLElement) {
				setWidth(`${element.getBoundingClientRect().width}px`);
			}
		}
	}, [currentIndex]);

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
			y: -14,
			opacity: 0,
			filter: "blur(6px)",
		},
		visible: {
			y: 0,
			opacity: 1,
			filter: "blur(0px)",
			transition: {
				duration: 0.38,
				ease: "easeOut" as const,
			},
		},
		exit: {
			y: 14,
			opacity: 0,
			filter: "blur(6px)",
			transition: {
				duration: 0.28,
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
				{words.map((word) => (
					<span key={word} className={`inline-block ${className}`}>
						{word}
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
						damping: 18,
						mass: 1.1,
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
