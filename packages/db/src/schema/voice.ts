/**
 * Voice dictation — voice-dictation epic.
 *
 * `voice_transcriptions` records each dictated prompt: the raw Whisper output,
 * the R1 post-processed RU/EN variants, the detected language, and optional
 * saved audio (Blob) for re-transcription after a network failure. Per-user,
 * org-scoped like the journal/memory tables.
 *
 * NEVER hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate --name="..."` (see AGENTS.md).
 */

import {
	index,
	integer,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { organizations, users } from "./auth";
import { voiceTranscriptionStatusValues } from "./enums";

export const voiceTranscriptionStatus = pgEnum(
	"voice_transcription_status",
	voiceTranscriptionStatusValues,
);

export const voiceTranscriptions = pgTable(
	"voice_transcriptions",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		createdBy: uuid("created_by")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),

		// Raw transcript from Whisper (auto-detected language).
		rawText: text("raw_text"),
		// R1 post-processed variants (formatted, detailed) in both languages.
		processedRu: text("processed_ru"),
		processedEn: text("processed_en"),
		// ISO-639 code Whisper detected (e.g. "ru", "en").
		language: text(),
		durationMs: integer("duration_ms"),
		// Optional saved audio for re-transcription (privacy: cleared on demand).
		audioBlobUrl: text("audio_blob_url"),

		status: voiceTranscriptionStatus().notNull().default("transcribed"),
		error: text(),

		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		updatedAt: timestamp("updated_at", { withTimezone: true })
			.notNull()
			.defaultNow()
			.$onUpdate(() => new Date()),
	},
	(t) => [
		index("voice_transcriptions_org_idx").on(t.organizationId),
		index("voice_transcriptions_user_created_idx").on(t.createdBy, t.createdAt),
	],
);

export type InsertVoiceTranscription = typeof voiceTranscriptions.$inferInsert;
export type SelectVoiceTranscription = typeof voiceTranscriptions.$inferSelect;

/**
 * Live transcript segments — Streaming-STT Phase-1.
 *
 * Each row is ONE finalized speech segment captured from a live voice room: the
 * org-scoped `voiceRoomName` (`org:{org}:voice:{channel}`) it belongs to, the
 * LiveKit speaker identity (+ display name) who produced it, the stitched final
 * text, and the wall-clock instant it was captured. Partial (in-flight) text is
 * NEVER persisted — only finals land here, so the table is an append-only,
 * replayable transcript log.
 *
 * Distinct from `voice_transcriptions` (per-user DICTATION → prompt). This table
 * is multi-speaker, room-scoped CONVERSATION transcript that fans out to every
 * participant's live activity panel.
 *
 * NEVER hand-edit migrations — change this file then run
 * `bunx drizzle-kit generate` (see AGENTS.md).
 */
export const liveTranscriptSegments = pgTable(
	"live_transcript_segments",
	{
		id: uuid().primaryKey().defaultRandom(),
		organizationId: uuid("organization_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		// Org-scoped LiveKit room name (`org:{org}:voice:{channelId}`) — groups the
		// segments of one live session so a panel can query "this room's transcript".
		roomName: text("room_name").notNull(),
		// LiveKit participant identity of the speaker (stable within the room).
		speakerIdentity: text("speaker_identity").notNull(),
		// Human-friendly speaker name at capture time (falls back to identity).
		speakerName: text("speaker_name").notNull(),
		// Stitched FINAL transcript text for this segment (no partials persisted).
		text: text().notNull(),
		// ISO-639 code Whisper detected for this chunk (e.g. "ru", "en"), or null.
		language: text(),
		// Who created the row (the participant whose mic produced the audio).
		createdBy: uuid("created_by")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		// Wall-clock capture instant (client-supplied chunk end), distinct from the
		// server insert time below; drives chronological ordering in the panel.
		capturedAt: timestamp("captured_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
		createdAt: timestamp("created_at", { withTimezone: true })
			.notNull()
			.defaultNow(),
	},
	(t) => [
		// Primary read path: "all segments for this room, in capture order".
		index("live_transcript_segments_room_captured_idx").on(
			t.roomName,
			t.capturedAt,
		),
		index("live_transcript_segments_org_idx").on(t.organizationId),
	],
);

export type InsertLiveTranscriptSegment =
	typeof liveTranscriptSegments.$inferInsert;
export type SelectLiveTranscriptSegment =
	typeof liveTranscriptSegments.$inferSelect;
