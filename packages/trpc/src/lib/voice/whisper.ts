/**
 * Groq Whisper transcription — voice-dictation epic.
 *
 * Server-side audio → text via Groq's OpenAI-compatible `audio/transcriptions`
 * endpoint (`whisper-large-v3-turbo`, automatic language detection). The Groq
 * key is read lazily from the environment so callers stay testable without it.
 */

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const WHISPER_MODEL = "whisper-large-v3-turbo";

export interface TranscriptionResult {
	text: string;
	/** ISO-639 code Whisper detected, or null. */
	language: string | null;
}

/** Resolve the Groq API key (shared by Whisper + post-processing). */
export function resolveGroqKey(): string | null {
	return process.env.GROQ_API_KEY?.trim() || null;
}

export function isVoiceConfigured(): boolean {
	return resolveGroqKey() !== null;
}

/**
 * Transcribe an audio buffer with Groq Whisper. Auto-detects language (no
 * `language` param). Throws on a missing key or a non-2xx response.
 */
export async function transcribeAudio(
	data: Uint8Array,
	mimeType: string,
	filename = "audio.webm",
): Promise<TranscriptionResult> {
	const key = resolveGroqKey();
	if (!key) throw new Error("GROQ_API_KEY is not configured for Whisper");

	const form = new FormData();
	form.append(
		"file",
		new Blob([new Uint8Array(data)], { type: mimeType }),
		filename,
	);
	form.append("model", WHISPER_MODEL);
	form.append("response_format", "verbose_json");

	const response = await fetch(`${GROQ_BASE_URL}/audio/transcriptions`, {
		method: "POST",
		headers: { Authorization: `Bearer ${key}` },
		body: form,
	});

	if (!response.ok) {
		const body = await response.text().catch(() => "");
		throw new Error(
			`Whisper request failed (${response.status}): ${body.slice(0, 300)}`,
		);
	}

	const data_ = (await response.json()) as { text?: string; language?: string };
	return {
		text: (data_.text ?? "").trim(),
		language: data_.language?.trim() || null,
	};
}
