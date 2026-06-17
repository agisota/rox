"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import { useEffect, useState } from "react";

interface TypewriterProps {
	text: string | ReadonlyArray<string>;
	speed?: number;
	initialDelay?: number;
	waitTime?: number;
	deleteSpeed?: number;
	loop?: boolean;
	className?: string;
	showCursor?: boolean;
	hideCursorOnType?: boolean;
	cursorChar?: string;
	cursorClassName?: string;
	cursorAnimationVariants?: {
		initial: Variants["initial"];
		animate: Variants["animate"];
	};
}

export function Typewriter({
	text,
	speed = 50,
	initialDelay = 0,
	waitTime = 2000,
	deleteSpeed = 30,
	loop = true,
	className,
	showCursor = true,
	hideCursorOnType = false,
	cursorChar = "|",
	cursorClassName = "ml-0.5",
	cursorAnimationVariants = {
		initial: { opacity: 0 },
		animate: {
			opacity: 1,
			transition: {
				duration: 0.01,
				repeat: Number.POSITIVE_INFINITY,
				repeatDelay: 0.4,
				repeatType: "reverse",
			},
		},
	},
}: TypewriterProps) {
	const prefersReducedMotion = useReducedMotion();
	const texts = Array.isArray(text) ? [...text] : [text];
	const [displayText, setDisplayText] = useState(
		prefersReducedMotion ? (texts[0] ?? "") : "",
	);
	const [currentIndex, setCurrentIndex] = useState(0);
	const [isDeleting, setIsDeleting] = useState(false);
	const [currentTextIndex, setCurrentTextIndex] = useState(0);

	useEffect(() => {
		if (prefersReducedMotion) return;

		let timeout: ReturnType<typeof setTimeout> | undefined;
		const currentText = texts[currentTextIndex] ?? "";

		const startTyping = () => {
			if (isDeleting) {
				if (displayText === "") {
					setIsDeleting(false);
					if (currentTextIndex === texts.length - 1 && !loop) {
						return;
					}
					setCurrentTextIndex((prev) => (prev + 1) % texts.length);
					setCurrentIndex(0);
					timeout = setTimeout(() => {}, waitTime);
				} else {
					timeout = setTimeout(() => {
						setDisplayText((prev: string) => prev.slice(0, -1));
					}, deleteSpeed);
				}
				return;
			}

			if (currentIndex < currentText.length) {
				timeout = setTimeout(() => {
					setDisplayText((prev: string) => prev + currentText[currentIndex]);
					setCurrentIndex((prev) => prev + 1);
				}, speed);
				return;
			}

			if (texts.length > 1) {
				timeout = setTimeout(() => {
					setIsDeleting(true);
				}, waitTime);
			}
		};

		if (currentIndex === 0 && !isDeleting && displayText === "") {
			timeout = setTimeout(startTyping, initialDelay);
		} else {
			startTyping();
		}

		return () => {
			if (timeout) clearTimeout(timeout);
		};
	}, [
		currentIndex,
		currentTextIndex,
		deleteSpeed,
		displayText,
		initialDelay,
		isDeleting,
		loop,
		prefersReducedMotion,
		speed,
		texts,
		waitTime,
	]);

	const hideCursor =
		hideCursorOnType &&
		(currentIndex < (texts[currentTextIndex]?.length ?? 0) || isDeleting);

	return (
		<span className={className}>
			{displayText}
			{showCursor && !prefersReducedMotion && (
				<motion.span
					variants={cursorAnimationVariants}
					className={`${cursorClassName}${hideCursor ? " hidden" : ""}`}
					initial="initial"
					animate="animate"
				>
					{cursorChar}
				</motion.span>
			)}
		</span>
	);
}
