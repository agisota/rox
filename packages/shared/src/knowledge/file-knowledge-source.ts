/**
 * `FileKnowledgeSource` — flat-file fallback reading `*.mdx` from a content
 * directory (default `apps/web/content/knowledge`). Read-only: `upsert` is not
 * supported here (the DB-backed source owns writes).
 *
 * Dependency-free frontmatter parsing keeps `@rox/shared` lean; the heavier
 * fumadocs/gray-matter path lives in the web app's build pipeline.
 */

import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { KnowledgeSource } from "./knowledge-source";
import { scoreDocument } from "./knowledge-source";
import type {
	KnowledgeBacklink,
	KnowledgeDocument,
	KnowledgeListFilter,
	KnowledgeSearchResult,
} from "./types";
import { extractWikiLinkTargets } from "./wikilinks";

/** Minimal YAML-ish frontmatter splitter (string/array scalar values only). */
export function parseFrontmatter(raw: string): {
	frontmatter: Record<string, unknown>;
	content: string;
} {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
	if (!match) return { frontmatter: {}, content: raw };

	const frontmatter: Record<string, unknown> = {};
	for (const line of (match[1] ?? "").split(/\r?\n/)) {
		const idx = line.indexOf(":");
		if (idx === -1) continue;
		const key = line.slice(0, idx).trim();
		const value = line.slice(idx + 1).trim();
		if (!key) continue;
		if (value.startsWith("[") && value.endsWith("]")) {
			frontmatter[key] = value
				.slice(1, -1)
				.split(",")
				.map((s) => s.trim().replace(/^["']|["']$/g, ""))
				.filter(Boolean);
		} else {
			frontmatter[key] = value.replace(/^["']|["']$/g, "");
		}
	}
	return { frontmatter, content: raw.slice(match[0].length) };
}

async function walkMdx(dir: string): Promise<string[]> {
	const out: string[] = [];
	let entries: Dirent[];
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return out; // directory absent → empty source
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...(await walkMdx(full)));
		} else if (entry.name.endsWith(".mdx") || entry.name.endsWith(".md")) {
			out.push(full);
		}
	}
	return out;
}

export interface FileKnowledgeSourceOptions {
	/** Absolute path to the content root. */
	contentDir: string;
	organizationId?: string;
}

export class FileKnowledgeSource implements KnowledgeSource {
	private readonly contentDir: string;
	private readonly organizationId: string;

	constructor(opts: FileKnowledgeSourceOptions) {
		this.contentDir = opts.contentDir;
		this.organizationId = opts.organizationId ?? "file";
	}

	private fileToSlug(file: string): string {
		return relative(this.contentDir, file)
			.replace(/\.(mdx?|md)$/, "")
			.split(sep)
			.join("/");
	}

	private async readAll(): Promise<KnowledgeDocument[]> {
		const files = await walkMdx(this.contentDir);
		const docs = await Promise.all(
			files.map(async (file) => {
				const raw = await readFile(file, "utf8");
				const { frontmatter, content } = parseFrontmatter(raw);
				const slug = this.fileToSlug(file);
				const tags = Array.isArray(frontmatter.tags)
					? (frontmatter.tags as string[])
					: [];
				const now = new Date(0);
				const doc: KnowledgeDocument = {
					id: slug,
					organizationId: this.organizationId,
					v2ProjectId: null,
					type: "doc",
					sourceKind: "file",
					slug,
					title:
						typeof frontmatter.title === "string" ? frontmatter.title : slug,
					markdown: content,
					frontmatter,
					body: null,
					tags,
					sourceRef: { filePath: file },
					createdByUserId: null,
					createdAt: now,
					updatedAt: now,
				};
				return doc;
			}),
		);
		return docs;
	}

	async list(filter?: KnowledgeListFilter): Promise<KnowledgeDocument[]> {
		let docs = await this.readAll();
		if (filter?.type) docs = docs.filter((d) => d.type === filter.type);
		const tag = filter?.tag;
		if (tag) docs = docs.filter((d) => d.tags.includes(tag));
		return docs.sort((a, b) => a.title.localeCompare(b.title));
	}

	async get(slug: string): Promise<KnowledgeDocument | null> {
		const docs = await this.readAll();
		return docs.find((d) => d.slug === slug) ?? null;
	}

	async search(
		query: string,
		filter?: KnowledgeListFilter,
	): Promise<KnowledgeSearchResult[]> {
		const docs = await this.list(filter);
		return docs
			.map((document) => ({ document, score: scoreDocument(document, query) }))
			.filter((r) => r.score > 0)
			.sort((a, b) => b.score - a.score);
	}

	upsert(): Promise<KnowledgeDocument> {
		return Promise.reject(
			new Error("FileKnowledgeSource is read-only; use the DB-backed source"),
		);
	}

	async resolveBacklinks(slug: string): Promise<KnowledgeBacklink[]> {
		const docs = await this.readAll();
		const backlinks: KnowledgeBacklink[] = [];
		for (const doc of docs) {
			if (doc.slug === slug) continue;
			const targets = extractWikiLinkTargets(doc.markdown ?? "");
			if (targets.includes(slug)) {
				backlinks.push({
					sourceDocumentId: doc.id,
					sourceSlug: doc.slug,
					sourceTitle: doc.title,
					resolved: true,
				});
			}
		}
		return backlinks;
	}
}
