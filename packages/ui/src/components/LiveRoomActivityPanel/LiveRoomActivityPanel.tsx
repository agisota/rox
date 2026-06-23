"use client";

import { Captions, Mic, MicOff, Radio, Volume2 } from "lucide-react";
import type * as React from "react";

import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";

/**
 * Structural copy of `@rox/rtc`'s activity model. Re-declared here (instead of
 * importing `@rox/rtc`) so `@rox/ui` stays free of a LiveKit/realtime
 * dependency — this panel is a PURE view fed plain data. The shapes are kept in
 * lockstep with `@rox/rtc/activity`.
 */
export interface LiveRoomActivityParticipant {
	identity: string;
	name: string;
	micOn: boolean;
	isLocal: boolean;
}

export type LiveRoomActivityEventKind =
	| "join"
	| "leave"
	| "speak-start"
	| "speak-end";

export interface LiveRoomActivityEvent {
	id: number;
	kind: LiveRoomActivityEventKind;
	identity: string;
	name: string;
	at: number;
}

export interface LiveRoomActivity {
	roster: LiveRoomActivityParticipant[];
	speaking: string[];
	log: LiveRoomActivityEvent[];
}

/**
 * One finalized transcript segment. Structural copy of `@rox/rtc`'s
 * `TranscriptSegment` (kept in lockstep) so this panel renders live words without
 * importing `@rox/rtc`. Streaming-STT Phase-1.
 */
export interface LiveRoomTranscriptSegment {
	id: string;
	speakerIdentity: string;
	speakerName: string;
	text: string;
	capturedAt: number;
}

/** Render-ready live transcript: finalized segments, oldest → newest. */
export interface LiveRoomTranscript {
	segments: LiveRoomTranscriptSegment[];
}

export interface LiveRoomActivityPanelProps
	extends React.ComponentProps<"div"> {
	/** Derived presence/speaking model (roster + speaking set + timeline). */
	activity: LiveRoomActivity;
	/**
	 * Optional live transcript (Streaming-STT Phase-1). When provided, a transcript
	 * log section renders below the activity journal. Omitted on surfaces that have
	 * no STT wired yet (e.g. the web stub), where the panel stays presence-only.
	 */
	transcript?: LiveRoomTranscript;
	/**
	 * Shown when the roster is empty (e.g. web media-join not wired yet). Lets the
	 * same component render an honest empty state instead of a blank box.
	 */
	emptyHint?: string;
}

const EVENT_LABEL: Record<LiveRoomActivityEventKind, string> = {
	join: "вошёл",
	leave: "вышел",
	"speak-start": "начал говорить",
	"speak-end": "замолчал",
};

const EVENT_DOT: Record<LiveRoomActivityEventKind, string> = {
	join: "bg-emerald-500",
	leave: "bg-muted-foreground",
	"speak-start": "bg-sky-500",
	"speak-end": "bg-muted-foreground",
};

function formatTime(at: number): string {
	// Locale-stable HH:MM:SS; `ru-RU` renders 24h which matches the app locale.
	return new Date(at).toLocaleTimeString("ru-RU", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

/**
 * Live Room Activity — a presence/speaking surface for an active voice room.
 * Renders the participant roster (with mic state), highlights who is speaking
 * now, and shows a scrolling, timestamped activity log. No STT: this is the
 * `live.transcript` shell, mounted behind the experimental gate.
 *
 * Shared by desktop and web: both map their LiveKit room to a `LiveRoomActivity`
 * and pass it here, so the surface stays identical across platforms.
 */
export function LiveRoomActivityPanel({
	activity,
	transcript,
	emptyHint = "Пока никого нет в комнате",
	className,
	...props
}: LiveRoomActivityPanelProps) {
	const speakingSet = new Set(activity.speaking);
	const speakingNames = activity.roster
		.filter((p) => speakingSet.has(p.identity))
		.map((p) => p.name);
	const reversedLog = [...activity.log].reverse();
	const transcriptSegments = transcript?.segments ?? [];

	return (
		<div
			data-slot="live-room-activity-panel"
			className={cn("flex w-72 flex-col gap-3 text-sm", className)}
			{...props}
		>
			<div className="flex items-center justify-between">
				<span className="flex items-center gap-1.5 font-medium text-foreground">
					<Radio className="size-3.5 text-emerald-500" aria-hidden />
					Активность комнаты
				</span>
				<Badge variant="secondary" className="tabular-nums">
					{activity.roster.length}
				</Badge>
			</div>

			<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
				<Volume2 className="size-3.5 shrink-0 text-sky-500" aria-hidden />
				{speakingNames.length > 0 ? (
					<span className="truncate text-foreground">
						Говорит: {speakingNames.join(", ")}
					</span>
				) : (
					<span>Сейчас тишина</span>
				)}
			</div>

			<Separator />

			<div className="flex flex-col gap-1">
				{activity.roster.length === 0 ? (
					<p className="py-1 text-xs text-muted-foreground">{emptyHint}</p>
				) : (
					activity.roster.map((p) => {
						const isSpeaking = speakingSet.has(p.identity);
						return (
							<div
								key={p.identity}
								className={cn(
									"flex items-center justify-between rounded-md px-2 py-1 transition-colors",
									isSpeaking && "bg-sky-500/10",
								)}
							>
								<span className="flex min-w-0 items-center gap-1.5">
									<span
										className={cn(
											"size-1.5 shrink-0 rounded-full",
											isSpeaking
												? "animate-pulse bg-sky-500"
												: "bg-muted-foreground/40",
										)}
										aria-hidden
									/>
									<span
										className={cn(
											"truncate",
											isSpeaking
												? "font-medium text-foreground"
												: "text-muted-foreground",
										)}
									>
										{p.name}
									</span>
									{p.isLocal && (
										<span className="shrink-0 text-[10px] text-muted-foreground">
											(вы)
										</span>
									)}
								</span>
								{p.micOn ? (
									<Mic
										className="size-3.5 shrink-0 text-muted-foreground"
										aria-label="Микрофон включён"
									/>
								) : (
									<MicOff
										className="size-3.5 shrink-0 text-destructive"
										aria-label="Микрофон выключен"
									/>
								)}
							</div>
						);
					})
				)}
			</div>

			<Separator />

			<div className="flex flex-col gap-1">
				<span className="text-xs font-medium text-muted-foreground">
					Журнал
				</span>
				{reversedLog.length === 0 ? (
					<p className="py-1 text-xs text-muted-foreground">Событий пока нет</p>
				) : (
					<ScrollArea className="h-32">
						<ul className="flex flex-col gap-0.5 pr-2">
							{reversedLog.map((event) => (
								<li
									key={event.id}
									className="flex items-center gap-1.5 text-xs text-muted-foreground"
								>
									<span
										className={cn(
											"size-1.5 shrink-0 rounded-full",
											EVENT_DOT[event.kind],
										)}
										aria-hidden
									/>
									<span className="tabular-nums text-muted-foreground/70">
										{formatTime(event.at)}
									</span>
									<span className="min-w-0 truncate">
										<span className="text-foreground">{event.name}</span>{" "}
										{EVENT_LABEL[event.kind]}
									</span>
								</li>
							))}
						</ul>
					</ScrollArea>
				)}
			</div>

			{transcript && (
				<>
					<Separator />
					<div className="flex flex-col gap-1">
						<span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
							<Captions className="size-3.5 shrink-0" aria-hidden />
							Транскрипт
						</span>
						{transcriptSegments.length === 0 ? (
							<p className="py-1 text-xs text-muted-foreground">
								Пока ничего не сказано
							</p>
						) : (
							<ScrollArea className="h-40">
								<ul className="flex flex-col gap-1.5 pr-2">
									{transcriptSegments.map((segment) => (
										<li key={segment.id} className="flex flex-col gap-0.5">
											<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
												<span className="font-medium text-muted-foreground">
													{segment.speakerName}
												</span>
												<span className="tabular-nums">
													{formatTime(segment.capturedAt)}
												</span>
											</span>
											<span className="text-xs text-foreground">
												{segment.text}
											</span>
										</li>
									))}
								</ul>
							</ScrollArea>
						)}
					</div>
				</>
			)}
		</div>
	);
}
