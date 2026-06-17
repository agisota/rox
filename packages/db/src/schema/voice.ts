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
