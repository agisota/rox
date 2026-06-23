import type { EntityKind } from "@rox/db/enums";

export interface EmbeddableEntity {
	kind: EntityKind;
	title: string;
	markdown?: string | null;
	body?: Record<string, unknown> | null;
}

export type EmbedTextResolver = (entity: EmbeddableEntity) => string;

const resolvers = new Map<EntityKind, EmbedTextResolver>();

export function registerEmbedTextResolver(
	kind: EntityKind,
	resolver: EmbedTextResolver,
): void {
	resolvers.set(kind, resolver);
}

export function clearEmbedTextResolversForTest(): void {
	resolvers.clear();
}

export function embedTextForEntity(entity: EmbeddableEntity): string {
	const resolver = resolvers.get(entity.kind);
	const text = resolver ? resolver(entity) : defaultEmbedText(entity);
	return normalizeEmbedText(text);
}

export function defaultEmbedText(entity: EmbeddableEntity): string {
	const bodySummary =
		typeof entity.body?.summary === "string" ? entity.body.summary : "";
	return [entity.title, entity.markdown ?? "", bodySummary].join("\n\n");
}

function normalizeEmbedText(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}
