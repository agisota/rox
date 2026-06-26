import { useConversationContext } from "@rox/ui/ai-elements/conversation";
import {
	HoverCard,
	HoverCardContent,
	HoverCardTrigger,
} from "@rox/ui/hover-card";
import { motionSpring, useShouldAnimate } from "@rox/ui/motion";
import { cn } from "@rox/ui/utils";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	findActiveOutlineId,
	type OutlineEntry,
	pushNavHistory,
} from "./message-scrollback-rail-core";

const JUMP_TOP_OFFSET_PX = 8;
const HOVER_CARD_RIGHT_EDGE_OFFSET_PX = -28;
const EDGE_SWIPE_THRESHOLD_PX = 64;
const EDGE_SWIPE_ZONE_PX = 32;

/** A cross-session recent for the Recents-flyout (F49). */
export interface ScrollbackRecent {
	sessionId: string;
	title: string;
	lastActiveAt?: string | number | Date;
}

export interface MessageScrollbackRailProps {
	/** Pre-derived, serializable outline (one entry per user message). */
	entries: OutlineEntry[];
	/** Cross-session recents (~10) for the Recents-flyout. */
	recents?: ScrollbackRecent[];
	/** Jump to a recent session (cross-session navigation). */
	onSelectRecent?: (sessionId: string) => void;
	/** Localised label for the recents section header. */
	recentsLabel?: string;
}

function findUserMessageElement(
	scrollElement: HTMLElement,
	messageId: string,
): HTMLElement | null {
	const userMessageElements = scrollElement.querySelectorAll<HTMLElement>(
		"[data-chat-user-message='true'][data-message-id]",
	);

	for (const element of userMessageElements) {
		if (element.dataset.messageId === messageId) {
			return element;
		}
	}

	return null;
}

/**
 * Consolidated conversation outline / scrollback rail (F49).
 *
 * Single source of truth in `@rox/ui/ai-elements` — desktop, web and mobile
 * render it from a serializable `OutlineEntry[]` derived via
 * `deriveOutlineEntries` (see `./message-scrollback-rail-core`). Behaviours:
 *  - floating outline by USER messages with a 60-char excerpt;
 *  - click → smooth-scroll + flash to the message;
 *  - nav-history stack (Alt+←/→ desktop, edge-swipe mobile);
 *  - cross-session Recents-flyout (~10) via `recents`/`onSelectRecent`.
 *
 * The component is presentational over its inputs; it relies on the
 * stick-to-bottom conversation context for the scroll element and uses
 * `data-message-id` anchors rendered by each platform's message list.
 */
export function MessageScrollbackRail({
	entries: outlineEntries,
	recents,
	onSelectRecent,
	recentsLabel = "Recent chats",
}: MessageScrollbackRailProps) {
	const { scrollRef, stopScroll } = useConversationContext();
	const [entries, setEntries] = useState<
		{ id: string; preview: string; top: number; isLatest: boolean }[]
	>([]);
	const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
	const shouldAnimate = useShouldAnimate("decorative");
	const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
	const [isCardOpen, setIsCardOpen] = useState(false);
	const [dismissedByClick, setDismissedByClick] = useState(false);
	const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const navStackRef = useRef<string[]>([]);
	const navCursorRef = useRef<number>(-1);
	const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [flashedMessageId, setFlashedMessageId] = useState<string | null>(null);

	const recalculateEntries = useCallback(() => {
		const scrollElement = scrollRef.current;
		if (!scrollElement || outlineEntries.length === 0) {
			setEntries([]);
			setActiveMessageId(null);
			return;
		}

		const scrollElementRect = scrollElement.getBoundingClientRect();

		const nextEntries = outlineEntries.map((message, index) => {
			const targetElement = findUserMessageElement(scrollElement, message.id);
			const fallbackTop = outlineEntries.length <= 1 ? 0 : index * 64;
			const top = targetElement
				? targetElement.getBoundingClientRect().top -
					scrollElementRect.top +
					scrollElement.scrollTop
				: fallbackTop;

			return { ...message, top };
		});

		setEntries(nextEntries);
		setActiveMessageId(
			findActiveOutlineId(nextEntries, scrollElement.scrollTop),
		);
	}, [scrollRef, outlineEntries]);

	useEffect(() => {
		const frame = requestAnimationFrame(recalculateEntries);
		return () => cancelAnimationFrame(frame);
	}, [recalculateEntries]);

	useEffect(() => {
		const scrollElement = scrollRef.current;
		if (!scrollElement) {
			return;
		}

		const handleScroll = () => {
			setActiveMessageId(findActiveOutlineId(entries, scrollElement.scrollTop));
		};

		scrollElement.addEventListener("scroll", handleScroll, { passive: true });
		return () => {
			scrollElement.removeEventListener("scroll", handleScroll);
		};
	}, [entries, scrollRef]);

	useEffect(() => {
		const scrollElement = scrollRef.current;
		if (!scrollElement) {
			return;
		}

		const resizeObserver = new ResizeObserver(() => {
			recalculateEntries();
		});
		resizeObserver.observe(scrollElement);

		const handleWindowResize = () => {
			recalculateEntries();
		};
		window.addEventListener("resize", handleWindowResize);

		return () => {
			resizeObserver.disconnect();
			window.removeEventListener("resize", handleWindowResize);
		};
	}, [recalculateEntries, scrollRef]);

	useEffect(
		() => () => {
			if (dismissTimeoutRef.current) {
				clearTimeout(dismissTimeoutRef.current);
			}
			if (flashTimeoutRef.current) {
				clearTimeout(flashTimeoutRef.current);
			}
		},
		[],
	);

	const handleCardOpenChange = useCallback(
		(nextOpen: boolean) => {
			if (nextOpen && dismissedByClick) {
				return;
			}
			setIsCardOpen(nextOpen);
		},
		[dismissedByClick],
	);

	const scrollToMessage = useCallback(
		(messageId: string, recordHistory: boolean) => {
			const scrollElement = scrollRef.current;
			if (!scrollElement) {
				return false;
			}

			const targetElement = findUserMessageElement(scrollElement, messageId);
			if (!targetElement) {
				return false;
			}

			stopScroll();
			const scrollElementRect = scrollElement.getBoundingClientRect();
			const nextScrollTop =
				targetElement.getBoundingClientRect().top -
				scrollElementRect.top +
				scrollElement.scrollTop -
				JUMP_TOP_OFFSET_PX;

			scrollElement.scrollTo({
				top: Math.max(0, nextScrollTop),
				behavior: "smooth",
			});
			setActiveMessageId(messageId);

			// Flash the target so the jump destination is unambiguous.
			setFlashedMessageId(messageId);
			if (flashTimeoutRef.current) {
				clearTimeout(flashTimeoutRef.current);
			}
			flashTimeoutRef.current = setTimeout(() => {
				setFlashedMessageId(null);
			}, 900);
			targetElement.setAttribute("data-scrollback-flash", "true");
			window.setTimeout(() => {
				targetElement.removeAttribute("data-scrollback-flash");
			}, 900);

			if (recordHistory) {
				const next = pushNavHistory(navStackRef.current, messageId);
				navStackRef.current = next;
				navCursorRef.current = next.length - 1;
			}

			return true;
		},
		[scrollRef, stopScroll],
	);

	const handleJumpToMessage = useCallback(
		(messageId: string) => {
			if (!scrollToMessage(messageId, true)) {
				return;
			}
			setDismissedByClick(true);
			setIsCardOpen(false);
			if (dismissTimeoutRef.current) {
				clearTimeout(dismissTimeoutRef.current);
			}
			dismissTimeoutRef.current = setTimeout(() => {
				setDismissedByClick(false);
			}, 250);
		},
		[scrollToMessage],
	);

	// Nav-history navigation shared by Alt+←/→ (desktop) and edge-swipe (mobile).
	const navigateHistory = useCallback(
		(direction: -1 | 1) => {
			const stack = navStackRef.current;
			if (stack.length === 0) {
				return;
			}
			const nextCursor = Math.min(
				Math.max(navCursorRef.current + direction, 0),
				stack.length - 1,
			);
			if (nextCursor === navCursorRef.current) {
				return;
			}
			navCursorRef.current = nextCursor;
			const targetId = stack[nextCursor];
			if (targetId) {
				scrollToMessage(targetId, false);
			}
		},
		[scrollToMessage],
	);

	// Desktop nav-history: Alt+ArrowLeft / Alt+ArrowRight.
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!event.altKey) {
				return;
			}
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				navigateHistory(-1);
			} else if (event.key === "ArrowRight") {
				event.preventDefault();
				navigateHistory(1);
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [navigateHistory]);

	// Mobile nav-history: horizontal edge-swipe from the left edge. Touch-only so
	// it stays inert on desktop; uses the same bounded stack as Alt+←/→.
	useEffect(() => {
		const scrollElement = scrollRef.current;
		if (!scrollElement || typeof window.ontouchstart === "undefined") {
			return;
		}

		let startX: number | null = null;
		let startY: number | null = null;
		let fromEdge = false;

		const handleTouchStart = (event: TouchEvent) => {
			const touch = event.touches[0];
			if (!touch) {
				return;
			}
			startX = touch.clientX;
			startY = touch.clientY;
			fromEdge =
				touch.clientX <= EDGE_SWIPE_ZONE_PX ||
				touch.clientX >= window.innerWidth - EDGE_SWIPE_ZONE_PX;
		};

		const handleTouchEnd = (event: TouchEvent) => {
			if (startX === null || startY === null || !fromEdge) {
				return;
			}
			const touch = event.changedTouches[0];
			if (!touch) {
				return;
			}
			const deltaX = touch.clientX - startX;
			const deltaY = touch.clientY - startY;
			if (
				Math.abs(deltaX) >= EDGE_SWIPE_THRESHOLD_PX &&
				Math.abs(deltaX) > Math.abs(deltaY) * 1.5
			) {
				navigateHistory(deltaX > 0 ? -1 : 1);
			}
			startX = null;
			startY = null;
			fromEdge = false;
		};

		scrollElement.addEventListener("touchstart", handleTouchStart, {
			passive: true,
		});
		scrollElement.addEventListener("touchend", handleTouchEnd, {
			passive: true,
		});
		return () => {
			scrollElement.removeEventListener("touchstart", handleTouchStart);
			scrollElement.removeEventListener("touchend", handleTouchEnd);
		};
	}, [navigateHistory, scrollRef]);

	const sortedRecents = useMemo(() => recents ?? [], [recents]);
	const hasRecents = sortedRecents.length > 0 && Boolean(onSelectRecent);

	if (entries.length === 0 && !hasRecents) {
		return null;
	}

	const emphasizedMessageId = hoveredMessageId ?? activeMessageId;

	return (
		<div className="absolute top-4 right-3 z-20 flex items-start">
			<HoverCard
				open={isCardOpen}
				onOpenChange={handleCardOpenChange}
				openDelay={60}
				closeDelay={180}
			>
				<HoverCardTrigger asChild>
					<div className="w-7 max-h-[calc(100vh-12rem)] cursor-default overflow-hidden p-1">
						<div className="flex flex-col gap-1.5">
							{entries.map((entry) => {
								const isEmphasized = emphasizedMessageId === entry.id;
								const isFlashed = flashedMessageId === entry.id;
								const markerColorClass = entry.isLatest
									? isEmphasized
										? "bg-muted-foreground/55"
										: "bg-muted-foreground/12"
									: isEmphasized || isFlashed
										? "bg-foreground"
										: "bg-muted-foreground/30 hover:bg-muted-foreground/45";

								return (
									<div key={entry.id} className="relative w-full flex-shrink-0">
										<motion.button
											type="button"
											className={cn(
												"h-0.5 w-full rounded-full transition-all",
												markerColorClass,
											)}
											style={{ transformOrigin: "center" }}
											animate={
												shouldAnimate
													? {
															scaleY: isEmphasized || isFlashed ? 2.4 : 1,
															opacity: isEmphasized || isFlashed ? 1 : 0.85,
														}
													: undefined
											}
											whileHover={shouldAnimate ? { scaleY: 2.4 } : undefined}
											whileTap={shouldAnimate ? { scaleY: 1.8 } : undefined}
											transition={{
												type: "spring",
												stiffness: 420,
												damping: 32,
											}}
											onMouseEnter={() => setHoveredMessageId(entry.id)}
											onMouseLeave={() => setHoveredMessageId(null)}
											onFocus={() => setHoveredMessageId(entry.id)}
											onBlur={() => setHoveredMessageId(null)}
											onClick={() => handleJumpToMessage(entry.id)}
											aria-label={`Jump to message: ${entry.preview}`}
										/>
										{shouldAnimate && activeMessageId === entry.id ? (
											<motion.div
												layoutId="scrollback-active"
												className="pointer-events-none absolute inset-x-0 top-0 h-0.5 rounded-full bg-foreground"
												transition={motionSpring.layout}
											/>
										) : null}
									</div>
								);
							})}
						</div>
					</div>
				</HoverCardTrigger>

				<HoverCardContent
					align="start"
					className="w-72 border-border/70 bg-background/95 p-2 backdrop-blur-sm"
					side="left"
					sideOffset={HOVER_CARD_RIGHT_EDGE_OFFSET_PX}
				>
					<div className="max-h-[65vh] overflow-y-auto">
						{entries.map((entry) => {
							const isEmphasized = emphasizedMessageId === entry.id;
							const entryClassName = entry.isLatest
								? isEmphasized
									? "bg-muted/65 text-muted-foreground/90"
									: "text-muted-foreground/60 hover:text-muted-foreground/85"
								: isEmphasized
									? "bg-primary/10 text-primary/85"
									: "text-muted-foreground/85 hover:text-foreground/90";

							return (
								<button
									key={entry.id}
									type="button"
									className={cn(
										"block w-full truncate rounded-md px-2 py-1.5 text-left text-xs transition-colors",
										entryClassName,
									)}
									onMouseEnter={() => setHoveredMessageId(entry.id)}
									onMouseLeave={() => setHoveredMessageId(null)}
									onFocus={() => setHoveredMessageId(entry.id)}
									onBlur={() => setHoveredMessageId(null)}
									onClick={() => handleJumpToMessage(entry.id)}
								>
									{entry.preview}
								</button>
							);
						})}

						{hasRecents ? (
							<div className="mt-1 border-border/60 border-t pt-1">
								<div className="px-2 py-1 font-medium text-[10px] text-muted-foreground/60 uppercase tracking-wide">
									{recentsLabel}
								</div>
								{sortedRecents.map((recent) => (
									<button
										key={recent.sessionId}
										type="button"
										className="block w-full truncate rounded-md px-2 py-1.5 text-left text-muted-foreground/85 text-xs transition-colors hover:bg-muted/50 hover:text-foreground/90"
										onClick={() => onSelectRecent?.(recent.sessionId)}
									>
										{recent.title || "Untitled chat"}
									</button>
								))}
							</div>
						) : null}
					</div>
				</HoverCardContent>
			</HoverCard>
		</div>
	);
}
