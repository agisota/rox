import type { PublicSharedResource } from "../../lib/profile-shared";

/**
 * Renders the immutable public snapshot of a shared chat session or artifact on
 * a profile's `/@<handle>/shared/...` route. Read-only: it only reads the
 * already-public `payload` produced by `shareRouter` and never touches private
 * data. Mirrors the renderers used by the canonical `/s/<slug>` viewer.
 */

type SharedMessage = {
	id: string;
	role: string;
	content: unknown[];
	createdAt: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(
	record: Record<string, unknown>,
	key: string,
): string | null {
	const value = record[key];
	return typeof value === "string" ? value : null;
}

function getRecord(
	record: Record<string, unknown>,
	key: string,
): Record<string, unknown> | null {
	const value = record[key];
	return isRecord(value) ? value : null;
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

function getMessages(payload: Record<string, unknown>): SharedMessage[] {
	const rawMessages = payload.messages;
	if (!Array.isArray(rawMessages)) return [];
	return rawMessages.flatMap((message): SharedMessage[] => {
		if (!isRecord(message)) return [];
		const id = getString(message, "id");
		const role = getString(message, "role");
		if (!id || !role) return [];
		const content = Array.isArray(message.content) ? message.content : [];
		const createdAt = getString(message, "createdAt");
		return [{ id, role, content, createdAt }];
	});
}

function stringifyUnknown(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

function getContentPartText(part: unknown): string | null {
	if (typeof part === "string") return part;
	if (!isRecord(part)) return null;
	const text = part.text ?? part.content;
	return typeof text === "string" ? text : null;
}

function renderMessageContent(content: unknown[]) {
	const textParts = content
		.map(getContentPartText)
		.filter((text): text is string => Boolean(text?.trim()));

	if (textParts.length > 0) {
		return (
			<div className="space-y-3">
				{textParts.map((text, index) => (
					<p
						key={`${index}-${text.slice(0, 16)}`}
						className="whitespace-pre-wrap leading-7"
					>
						{text}
					</p>
				))}
			</div>
		);
	}

	return (
		<pre className="overflow-x-auto rounded-md border bg-muted/40 p-4 font-mono text-sm text-muted-foreground">
			{stringifyUnknown(content)}
		</pre>
	);
}

function RoleBadge({ role }: { role: string }) {
	const label = role === "assistant" ? "Rox" : role;
	return (
		<span className="inline-flex min-w-20 items-center justify-center rounded border bg-muted px-2 py-1 text-xs uppercase text-muted-foreground">
			{label}
		</span>
	);
}

function SharedChat({ messages }: { messages: SharedMessage[] }) {
	if (messages.length === 0) {
		return (
			<p className="rounded-md border bg-muted/30 p-5 text-sm text-muted-foreground">
				В этом снимке чата нет сообщений.
			</p>
		);
	}

	return (
		<div className="space-y-4">
			{messages.map((message) => (
				<article key={message.id} className="rounded-md border bg-muted/30 p-5">
					<div className="mb-4 flex flex-wrap items-center gap-3">
						<RoleBadge role={message.role} />
						{message.createdAt ? (
							<span className="text-xs text-muted-foreground">
								{toDateLabel(message.createdAt)}
							</span>
						) : null}
					</div>
					<div className="text-foreground">
						{renderMessageContent(message.content)}
					</div>
				</article>
			))}
		</div>
	);
}

function SharedArtifact({
	artifact,
}: {
	artifact: Record<string, unknown> | null;
}) {
	if (!artifact) {
		return (
			<p className="rounded-md border bg-muted/30 p-5 text-sm text-muted-foreground">
				Этот снимок артефакта пуст.
			</p>
		);
	}

	const markdown = getString(artifact, "markdown");
	const body = artifact.body;
	const blobPathname = getString(artifact, "blobPathname");
	const mediaType = getString(artifact, "mediaType");

	if (markdown) {
		return (
			<pre className="overflow-x-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-5 font-mono text-sm leading-7 text-foreground">
				{markdown}
			</pre>
		);
	}

	if (body !== null && body !== undefined) {
		return (
			<pre className="overflow-x-auto rounded-md border bg-muted/40 p-5 font-mono text-sm leading-7 text-foreground">
				{stringifyUnknown(body)}
			</pre>
		);
	}

	return (
		<div className="rounded-md border bg-muted/30 p-5 text-sm text-muted-foreground">
			<p>Файл-артефакт</p>
			{mediaType ? <p className="mt-2 text-sm">{mediaType}</p> : null}
			{blobPathname ? (
				<p className="mt-2 break-all font-mono text-sm">{blobPathname}</p>
			) : null}
		</div>
	);
}

export function SharedResourceContent({
	resource,
}: {
	resource: PublicSharedResource;
}) {
	const payload = isRecord(resource.payload) ? resource.payload : {};

	if (resource.resourceType === "chat_session") {
		return <SharedChat messages={getMessages(payload)} />;
	}

	if (resource.resourceType === "artifact") {
		return <SharedArtifact artifact={getRecord(payload, "artifact")} />;
	}

	return (
		<pre className="overflow-x-auto rounded-md border bg-muted/40 p-5 font-mono text-sm leading-7 text-foreground">
			{stringifyUnknown(payload)}
		</pre>
	);
}
