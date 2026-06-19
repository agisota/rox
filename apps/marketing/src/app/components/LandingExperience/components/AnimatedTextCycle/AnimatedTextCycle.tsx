"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

interface AnimatedTextCycleProps {
	words: ReadonlyArray<string>;
	interval?: number;
	className?: string;
	/** Backward-compatible flag for call sites that opt into fast agent cycling. */
	fast?: boolean;
}

export function AnimatedTextCycle({
	words,
	interval = 5000,
	className = "",
}: AnimatedTextCycleProps) {
	const [currentIndex, setCurrentIndex] = useState(0);
	const [box, setBox] = useState({ height: "1em", width: "auto" });
	const measureRef = useRef<HTMLDivElement>(null);
	const measuredWords = useMemo(() => {
		const seen = new Map<string, number>();
		return words.map((word) => {
			const count = seen.get(word) ?? 0;
			seen.set(word, count + 1);
			return { key: `${word}-${count}`, word };
		});
	}, [words]);

	useLayoutEffect(() => {
		if (words.length === 0) return;
		if (currentIndex >= words.length) {
			setCurrentIndex(0);
			return;
		}
		if (measureRef.current) {
			let maxWidth = 0;
			let maxHeight = 0;

			for (const element of Array.from(measureRef.current.children)) {
				if (element instanceof HTMLElement) {
					const rect = element.getBoundingClientRect();
					maxWidth = Math.max(maxWidth, rect.width);
					maxHeight = Math.max(maxHeight, rect.height);
				}
			}

			if (maxWidth > 0 && maxHeight > 0) {
				setBox({
					height: `${Math.ceil(maxHeight)}px`,
					width: `${Math.ceil(maxWidth)}px`,
				});
			}
		}
	}, [currentIndex, words.length]);

	useEffect(() => {
		if (words.length <= 1) return;

		const timer = setInterval(() => {
			setCurrentIndex((prevIndex) => (prevIndex + 1) % words.length);
		}, interval);

		return () => clearInterval(timer);
	}, [interval, words.length]);

	if (words.length === 0) return null;

	const activeWord = words[currentIndex] ?? words[0];

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

			<span
				className="relative inline-grid align-baseline"
				style={{
					height: box.height,
					lineHeight: "inherit",
					minWidth: box.width,
					width: box.width,
				}}
			>
				<span
					key={currentIndex}
					className={`inline-block ${className}`}
					style={{ gridArea: "1 / 1", whiteSpace: "nowrap" }}
				>
					{activeWord}
				</span>
			</span>
		</>
	);
}
