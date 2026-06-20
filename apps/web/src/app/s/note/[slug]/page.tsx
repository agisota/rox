import { db } from "@rox/db/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

type SharedNotePageProps = {
	params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

/**
 * Public read-only view of a published note (D7 — Workspace Suite P2).
 *
 * Lives in its own `/s/note/<slug>` namespace, separate from the `publicShares`
 * slugs served at `/s/<slug>`: `notebooksRouter.setPublished` mints a per-note
 * `note_notes.public_slug` and advertises this URL, so the page resolves the
 * note directly from `note_notes` (a slug from the other space must NOT match).
 *
 * Anonymous DB read, gated only by `is_published = true`. The body is rendered
 * as plain text inside a <pre> — never `dangerouslySetInnerHTML` — so a shared
 * note can never inject markup. Only presentation fields are read.
 */
async function getPublishedNote(slug: string) {
	return db.query.noteNotes.findFirst({
		where: (noteNotes, { and, eq }) =>
			and(eq(noteNotes.publicSlug, slug), eq(noteNotes.isPublished, true)),
		columns: {
			id: true,
			title: true,
			markdown: true,
			createdAt: true,
			updatedAt: true,
		},
	});
}

function toDateLabel(value: unknown): string | null {
	const date =
		value instanceof Date
			? value
			: typeof value === "string"
				? new Date(value)
				: null;

	if (!date || Number.isNaN(date.getTime())) return null;

	return new Intl.DateTimeFormat("ru", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(date);
}

export async function generateMetadata({
	params,
}: SharedNotePageProps): Promise<Metadata> {
	const { slug } = await params;
	const note = await getPublishedNote(slug);
	if (!note) {
		return { title: "Заметка не найдена" };
	}

	return {
		title: note.title,
		description: "Опубликовано из Rox",
	};
}

export default async function SharedNotePage({ params }: SharedNotePageProps) {
	const { slug } = await params;
	const note = await getPublishedNote(slug);
	if (!note) notFound();

	const publishedAt =
		toDateLabel(note.updatedAt) ?? toDateLabel(note.createdAt);

	return (
		<main className="min-h-screen bg-black text-zinc-100">
			<div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10">
				<header className="border-white/10 border-b pb-6">
					<p className="mb-4 font-mono text-sm text-zinc-500">Заметка Rox</p>
					<h1 className="text-balance font-medium text-3xl text-white md:text-5xl">
						{note.title}
					</h1>
					{publishedAt ? (
						<div className="mt-5 flex flex-wrap gap-3 text-sm text-zinc-500">
							<span>{publishedAt}</span>
						</div>
					) : null}
				</header>
				{note.markdown.trim() ? (
					<pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black/40 p-5 font-mono text-sm leading-7 text-zinc-100">
						{note.markdown}
					</pre>
				) : (
					<p className="rounded-md border border-white/10 bg-white/[0.03] p-5 text-zinc-400">
						Эта заметка пока пуста.
					</p>
				)}
			</div>
		</main>
	);
}
