/**
 * Chat-export archive parser — journal-memory epic.
 *
 * Extracts conversations (title + flattened transcript) from a ChatGPT or
 * Anthropic data-export JSON. Pure + dependency-free so it can be unit-tested.
 * Defensive: unknown/malformed shapes yield an empty list rather than throwing.
 */

export type ArchiveProvider = "chatgpt" | "anthropic";

export interface ParsedConversation {
	title: string;
	text: string;
}

export function parseArchiveExport(
	provider: ArchiveProvider,
	jsonText: string,
): ParsedConversation[] {
	let data: unknown;
	try {
		data = JSON.parse(jsonText);
	} catch {
		return [];
	}
	if (!Array.isArray(data)) return [];
	return provider === "chatgpt" ? parseChatGpt(data) : parseAnthropic(data);
}

function parseChatGpt(convos: unknown[]): ParsedConversation[] {
	const out: ParsedConversation[] = [];
	for (const convo of convos) {
		if (!isRecord(convo)) continue;
		const title = cleanTitle(convo.title);
		const mapping = convo.mapping;
		if (!isRecord(mapping)) continue;

		const messages = Object.values(mapping)
			.filter(isRecord)
			.map((node) => node.message)
			.filter(isRecord)
			.sort((a, b) => num(a.create_time) - num(b.create_time));

		const lines: string[] = [];
		for (const msg of messages) {
			const role = roleLabel(get(msg, ["author", "role"]));
			const parts = get(msg, ["content", "parts"]);
			const text = Array.isArray(parts)
				? parts
						.filter((p): p is string => typeof p === "string")
						.join("\n")
						.trim()
				: "";
			if (text) lines.push(`${role}: ${text}`);
		}
		const text = lines.join("\n").trim();
		if (text) out.push({ title, text });
	}
	return out;
}

function parseAnthropic(convos: unknown[]): ParsedConversation[] {
	const out: ParsedConversation[] = [];
	for (const convo of convos) {
		if (!isRecord(convo)) continue;
		const title = cleanTitle(convo.name);
		const messages = convo.chat_messages;
		if (!Array.isArray(messages)) continue;

		const lines: string[] = [];
		for (const msg of messages) {
			if (!isRecord(msg)) continue;
			const role = roleLabel(msg.sender);
			const text = String(msg.text ?? "").trim();
			if (text) lines.push(`${role}: ${text}`);
		}
		const text = lines.join("\n").trim();
		if (text) out.push({ title, text });
	}
	return out;
}

function cleanTitle(value: unknown): string {
	const t = String(value ?? "").trim();
	return t.length > 0 ? t : "Без названия";
}

function roleLabel(role: unknown): string {
	const r = String(role ?? "").toLowerCase();
	if (r === "user" || r === "human") return "Пользователь";
	if (r === "assistant") return "Ассистент";
	return r || "Сообщение";
}

function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number {
	return typeof v === "number" ? v : 0;
}

function get(obj: Record<string, unknown>, path: string[]): unknown {
	let cur: unknown = obj;
	for (const key of path) {
		if (!isRecord(cur)) return undefined;
		cur = cur[key];
	}
	return cur;
}
