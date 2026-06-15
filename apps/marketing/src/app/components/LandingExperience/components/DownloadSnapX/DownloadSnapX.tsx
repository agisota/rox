"use client";

import { DOWNLOAD_URL_MAC_ARM64 } from "@rox/shared/constants";
import { createDraggable, utils } from "animejs";
import { useCallback, useEffect, useRef, useState } from "react";
import { SNAP_LABEL_ARMED, SNAP_LABEL_IDLE } from "../../constants";

interface DownloadSnapXProps {
	onDownloadStart: () => void;
}

/**
 * Minimal shape of the anime.js v4 `Draggable` instance fields we read/use here.
 * anime.js exposes `progressX` (0→1 across the allowed range), `revert()` for
 * cleanup, `refresh()` to recompute bounds after a resize, and a settable `x`.
 */
interface DraggableLike {
	progressX: number;
	x: number;
	revert: () => void;
	refresh: () => void;
}

/** Inset of the handle from the track edges — mirrors `top/left: 6px` in CSS. */
const TRACK_PADDING = 6;
/** progressX threshold at which the control is considered "armed". */
const ARMED_THRESHOLD = 0.85;
/** progressX threshold at which releasing triggers the download. */
const COMPLETE_THRESHOLD = 0.92;

const downloadArrowSvg = (
	<svg viewBox="0 0 22 22" aria-hidden="true" focusable="false">
		<path
			d="M11 3v9m0 0 4-4m-4 4-4-4"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
		/>
		<path
			d="M4 16.5h14"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
		/>
	</svg>
);

/**
 * Slide-to-download control. The user drags the handle from left to right along
 * the track; on release past the end it triggers the actual `.dmg` download and
 * notifies the parent via `onDownloadStart`. Adapted from Julian Garnier's anime.js
 * v4 "Snap X" draggable example (`createDraggable` with `y: false` + snap).
 */
export function DownloadSnapX({ onDownloadStart }: DownloadSnapXProps) {
	const trackRef = useRef<HTMLDivElement>(null);
	const fillRef = useRef<HTMLDivElement>(null);
	const handleRef = useRef<HTMLDivElement>(null);
	const completedRef = useRef(false);
	const [label, setLabel] = useState(SNAP_LABEL_IDLE);

	const triggerDownload = useCallback(() => {
		const anchor = document.createElement("a");
		anchor.href = DOWNLOAD_URL_MAC_ARM64;
		anchor.download = "";
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
	}, []);

	const complete = useCallback(() => {
		if (completedRef.current) return;
		completedRef.current = true;
		triggerDownload();
		onDownloadStart();
	}, [onDownloadStart, triggerDownload]);

	useEffect(() => {
		const track = trackRef.current;
		const fill = fillRef.current;
		const handle = handleRef.current;
		if (!track || !fill || !handle) return;

		// The handle travels from x=0 to the far edge of the track minus its own
		// width and the padding on both sides. Snapping to that distance makes the
		// handle settle at either start (0) or end (full) of the range.
		const travel = () =>
			Math.max(0, track.clientWidth - handle.clientWidth - TRACK_PADDING * 2);

		const setFill = (progress: number) => {
			utils.set(fill, { scaleX: progress });
		};

		const draggable = createDraggable(handle, {
			container: track,
			containerPadding: TRACK_PADDING,
			snap: travel(),
			y: false,
			onUpdate: (self: DraggableLike) => {
				const progress = self.progressX;
				setFill(progress);
				setLabel(
					progress > ARMED_THRESHOLD ? SNAP_LABEL_ARMED : SNAP_LABEL_IDLE,
				);
			},
			onRelease: (self: DraggableLike) => {
				if (self.progressX >= COMPLETE_THRESHOLD) {
					setFill(1);
					complete();
				} else {
					self.x = 0;
					setFill(0);
					setLabel(SNAP_LABEL_IDLE);
				}
			},
		}) as unknown as DraggableLike;

		const observer = new ResizeObserver(() => {
			draggable.refresh();
		});
		observer.observe(track);

		return () => {
			observer.disconnect();
			draggable.revert();
		};
	}, [complete]);

	function handleKeyActivate(event: React.KeyboardEvent<HTMLDivElement>) {
		const { key } = event;
		if (
			key === "Enter" ||
			key === " " ||
			key === "ArrowRight" ||
			key === "End"
		) {
			event.preventDefault();
			setLabel(SNAP_LABEL_ARMED);
			if (fillRef.current) {
				utils.set(fillRef.current, { scaleX: 1 });
			}
			complete();
		}
	}

	return (
		<div
			className="rox-snap"
			ref={trackRef}
			role="slider"
			tabIndex={0}
			aria-label="Перетащите, чтобы скачать"
			aria-valuemin={0}
			aria-valuemax={100}
			aria-valuenow={0}
			onKeyDown={handleKeyActivate}
		>
			<div className="rox-snap__fill" ref={fillRef} />
			<div className="rox-snap__label">{label}</div>
			<div className="rox-snap__handle" ref={handleRef}>
				{downloadArrowSvg}
			</div>
		</div>
	);
}
