"use client";

import {
	type HTMLMotionProps,
	motion,
	type TargetAndTransition,
	useReducedMotion,
} from "motion/react";
import { type ComponentProps, useLayoutEffect, useRef } from "react";
import {
	type OverflowFadeState,
	useOverflowFade,
} from "../../../hooks/use-overflow-fade";
import { cn } from "../../../lib/utils";
import "../fade-edge.css";

type OverflowFadeEdge = "top" | "right" | "bottom" | "left";

const DEFAULT_FADE_EDGES: OverflowFadeEdge[] = ["right"];

interface OverflowFadeContainerProps extends ComponentProps<"div"> {
	/**
	 * Edges to fade while that edge still has hidden scrollable content.
	 * Keep this for scroll containers; masks apply to the whole painted element.
	 */
	fadeEdges?: OverflowFadeEdge[];
	/**
	 * Reports measured overflow for consumers that need layout decisions, such as
	 * moving an action button outside the scroller once content overflows.
	 */
	onOverflowChange?: (state: OverflowFadeState) => void;
	/**
	 * Observe direct children for size/list changes. Useful for small dynamic
	 * scrollers such as tabs; avoid on large or virtualized lists without profiling.
	 */
	observeChildren?: boolean;
}

export function OverflowFadeContainer({
	ref: forwardedRef,
	className,
	fadeEdges = DEFAULT_FADE_EDGES,
	onOverflowChange,
	observeChildren = false,
	...props
}: OverflowFadeContainerProps) {
	const {
		ref,
		hasOverflowX,
		hasOverflowY,
		canScrollTop,
		canScrollRight,
		canScrollBottom,
		canScrollLeft,
	} = useOverflowFade<HTMLDivElement>({ observeChildren });

	const prefersReduced = useReducedMotion();

	const edgeSize = (edge: OverflowFadeEdge, canScroll: boolean) =>
		fadeEdges.includes(edge) && canScroll ? "var(--fade-edge-size)" : "0px";

	const setRef = (node: HTMLDivElement | null) => {
		ref.current = node;
		if (typeof forwardedRef === "function") {
			forwardedRef(node);
		} else if (forwardedRef) {
			forwardedRef.current = node;
		}
	};

	const onOverflowChangeRef = useRef(onOverflowChange);
	useLayoutEffect(() => {
		onOverflowChangeRef.current = onOverflowChange;
	});

	useLayoutEffect(() => {
		onOverflowChangeRef.current?.({
			hasOverflowX,
			hasOverflowY,
			canScrollLeft,
			canScrollRight,
			canScrollTop,
			canScrollBottom,
		});
	}, [
		canScrollBottom,
		canScrollLeft,
		canScrollRight,
		canScrollTop,
		hasOverflowX,
		hasOverflowY,
	]);

	return (
		<motion.div
			ref={setRef}
			className={cn("fade-edge-mask", className)}
			animate={
				{
					"--fade-edge-t-size": edgeSize("top", canScrollTop),
					"--fade-edge-r-size": edgeSize("right", canScrollRight),
					"--fade-edge-b-size": edgeSize("bottom", canScrollBottom),
					"--fade-edge-l-size": edgeSize("left", canScrollLeft),
				} as TargetAndTransition
			}
			transition={
				prefersReduced ? { duration: 0 } : { duration: 0.18, ease: "easeOut" }
			}
			{...(props as HTMLMotionProps<"div">)}
		/>
	);
}
