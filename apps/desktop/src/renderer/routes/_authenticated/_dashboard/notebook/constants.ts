import type { KnowledgeDocumentType } from "@rox/shared/knowledge";

/**
 * Notebook document types surfaced in the desktop UI. Kept local (typed against
 * the shared union) so the renderer never imports the `@rox/shared/knowledge`
 * barrel at runtime — that barrel pulls in `FileKnowledgeSource`, which depends
 * on `node:fs`. `import type` above is erased at build time.
 */
export const DOCUMENT_TYPES: ReadonlyArray<{
	value: KnowledgeDocumentType;
	label: string;
}> = [
	{ value: "note", label: "Note" },
	{ value: "prd", label: "PRD" },
	{ value: "spec", label: "Spec" },
	{ value: "doc", label: "Doc" },
	{ value: "meeting_summary", label: "Meeting" },
	{ value: "reference", label: "Reference" },
];

const TYPE_LABELS = new Map(DOCUMENT_TYPES.map((t) => [t.value, t.label]));

export function documentTypeLabel(type: KnowledgeDocumentType): string {
	return TYPE_LABELS.get(type) ?? type;
}
