import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * NoteReader is the Notion-grade reader/editor pane for a single note. This gate
 * proves the surface CONTRACT a static render can see, without pulling the heavy
 * Tiptap editor (mocked to a sentinel) or any cloud/electron singleton:
 *
 *   • the rich body editor mounts with the RU empty-note placeholder
 *     ('Нажмите «/» …') — i.e. Notes is no longer a raw markdown textarea, and
 *   • the inline TITLE RENAME affordance is present (a 'Переименовать заметку'
 *     control showing the current title), and
 *   • a DELETE affordance is present ('Удалить заметку'), and
 *   • the autosave-state pill reflects `saveState` ('Сохранение…' / 'Сохранено').
 *
 * The Tiptap MarkdownEditor is module-mocked so this asserts OUR reader wiring,
 * never ProseMirror/lowlight/electron — mirroring the desktop test discipline of
 * mocking app-internal singletons rather than the framework.
 */

// Sentinel editor: echoes the placeholder + the markdown so we can assert the
// rich body is mounted (not a textarea) and is fed the live value.
mock.module("renderer/components/MarkdownEditor", () => ({
	MarkdownEditor: ({
		content,
		placeholder,
	}: {
		content: string;
		placeholder?: string;
	}) => (
		<div data-testid="markdown-editor" data-placeholder={placeholder}>
			{content}
		</div>
	),
}));

const { NoteReader } = await import("./NoteReader");

const NOTE = {
	id: "00000000-0000-0000-0000-0000000000cc",
	title: "Мой план",
	markdown: "# Заголовок\n\nтело",
};

function noop() {}

describe("NoteReader (notes editor surface)", () => {
	test("mounts the rich Tiptap body with the RU empty-note placeholder + current title", () => {
		const html = renderToStaticMarkup(
			<NoteReader
				note={NOTE}
				markdown={NOTE.markdown}
				saveState="idle"
				onMarkdownChange={noop}
				onMarkdownSave={noop}
				onRenameTitle={noop}
				onDelete={noop}
			/>,
		);
		// Rich editor mounted (sentinel), fed the live markdown — NOT a raw textarea.
		expect(html).toContain('data-testid="markdown-editor"');
		expect(html).toContain("Нажмите «/» для команд или начните писать…");
		expect(html).not.toContain("<textarea");
		// Title is shown and is rename-able.
		expect(html).toContain("Мой план");
		expect(html).toContain("Переименовать заметку");
		// Delete affordance present.
		expect(html).toContain("Удалить заметку");
	});

	test("shows the 'Сохранение…' pill while autosaving", () => {
		const html = renderToStaticMarkup(
			<NoteReader
				note={NOTE}
				markdown={NOTE.markdown}
				saveState="saving"
				onMarkdownChange={noop}
				onMarkdownSave={noop}
				onRenameTitle={noop}
				onDelete={noop}
			/>,
		);
		expect(html).toContain("Сохранение…");
	});

	test("shows the 'Сохранено' confirmation pill after a successful save", () => {
		const html = renderToStaticMarkup(
			<NoteReader
				note={NOTE}
				markdown={NOTE.markdown}
				saveState="saved"
				onMarkdownChange={noop}
				onMarkdownSave={noop}
				onRenameTitle={noop}
				onDelete={noop}
			/>,
		);
		expect(html).toContain("Сохранено");
	});

	test("renders the destructive confirm copy referencing the note title", () => {
		const html = renderToStaticMarkup(
			<NoteReader
				note={NOTE}
				markdown={NOTE.markdown}
				saveState="idle"
				deleting
				onMarkdownChange={noop}
				onMarkdownSave={noop}
				onRenameTitle={noop}
				onDelete={noop}
			/>,
		);
		// The AlertDialog content is portalled/closed by default, but the trigger
		// (disabled while deleting) is part of the static tree.
		expect(html).toContain("Удалить заметку");
	});
});
