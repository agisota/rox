import { db } from "@rox/db/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

type SharedPageProps = {
	params: Promise<{ slug: string }>;
};

type SharedMessage = {
	id: string;
	role: string;
	content: unknown[];
	createdAt: string | null;
};

type PublicShare = NonNullable<Awaited<ReturnType<typeof getPublicShare>>>;

export const dynamic = "force-dynamic";

async function getPublicShare(slug: string) {
	return db.query.publicShares.findFirst({
		where: (publicShares, { and, eq, isNull }) =>
			and(eq(publicShares.slug, slug), isNull(publicShares.revokedAt)),
		columns: {
			id: true,
			resourceType: true,
			resourceId: true,
			slug: true,
			title: true,
			payload: true,
			createdAt: true,
		},
	});
}

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

function getPayload(share: PublicShare): Record<string, unknown> {
	return isRecord(share.payload) ? share.payload : {};
}

function getShareType(payload: Record<string, unknown>): string {
	const type = getString(payload, "type");
	return type ?? "unknown";
}

function getPayloadTitle(
	payload: Record<string, unknown>,
	fallback: string | null,
): string {
	if (fallback) return fallback;
	const session = getRecord(payload, "session");
	if (session) {
		const title = getString(session, "title");
		if (title) return title;
	}
	const artifact = getRecord(payload, "artifact");
	if (artifact) {
		const title = getString(artifact, "title");
		if (title) return title;
	}
	return "Shared Rox item";
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
		<pre className="overflow-x-auto rounded-md border border-white/10 bg-black/40 p-4 font-mono text-sm text-zinc-300">
			{stringifyUnknown(content)}
		</pre>
	);
}

function RoleBadge({ role }: { role: string }) {
	const label = role === "assistant" ? "Rox" : role;
	return (
		<span className="inline-flex min-w-20 items-center justify-center rounded border border-white/10 bg-white/5 px-2 py-1 text-xs uppercase text-zinc-400">
			{label}
		</span>
	);
}

function SharedChat({ messages }: { messages: SharedMessage[] }) {
	if (messages.length === 0) {
		return (
			<p className="rounded-md border border-white/10 bg-white/[0.03] p-5 text-zinc-400">
				This shared chat snapshot has no messages.
			</p>
		);
	}

	return (
		<div className="space-y-4">
			{messages.map((message) => (
				<article
					key={message.id}
					className="rounded-md border border-white/10 bg-white/[0.03] p-5"
				>
					<div className="mb-4 flex flex-wrap items-center gap-3">
						<RoleBadge role={message.role} />
						{message.createdAt ? (
							<span className="text-xs text-zinc-500">
								{toDateLabel(message.createdAt)}
							</span>
						) : null}
					</div>
					<div className="text-zinc-100">
						{renderMessageContent(message.content)}
					</div>
				</article>
			))}
		</div>
	);
}

function getArtifact(
	payload: Record<string, unknown>,
): Record<string, unknown> | null {
	return getRecord(payload, "artifact");
}

function SharedArtifact({
	artifact,
}: {
	artifact: Record<string, unknown> | null;
}) {
	if (!artifact) {
		return (
			<p className="rounded-md border border-white/10 bg-white/[0.03] p-5 text-zinc-400">
				This shared artifact snapshot is empty.
			</p>
		);
	}

	const markdown = getString(artifact, "markdown");
	const body = artifact.body;
	const blobPathname = getString(artifact, "blobPathname");
	const mediaType = getString(artifact, "mediaType");

	if (markdown) {
		return (
			<pre className="overflow-x-auto whitespace-pre-wrap rounded-md border border-white/10 bg-black/40 p-5 font-mono text-sm leading-7 text-zinc-100">
				{markdown}
			</pre>
		);
	}

	if (body !== null && body !== undefined) {
		return (
			<pre className="overflow-x-auto rounded-md border border-white/10 bg-black/40 p-5 font-mono text-sm leading-7 text-zinc-100">
				{stringifyUnknown(body)}
			</pre>
		);
	}

	return (
		<div className="rounded-md border border-white/10 bg-white/[0.03] p-5 text-zinc-300">
			<p>File artifact</p>
			{mediaType ? (
				<p className="mt-2 text-sm text-zinc-500">{mediaType}</p>
			) : null}
			{blobPathname ? (
				<p className="mt-2 break-all font-mono text-sm text-zinc-500">
					{blobPathname}
				</p>
			) : null}
		</div>
	);
}

function SharedContent({
	share,
	payload,
}: {
	share: PublicShare;
	payload: Record<string, unknown>;
}) {
	const shareType = getShareType(payload);

	if (shareType === "chat_session" || share.resourceType === "chat_session") {
		return <SharedChat messages={getMessages(payload)} />;
	}

	if (shareType === "artifact" || share.resourceType === "artifact") {
		return <SharedArtifact artifact={getArtifact(payload)} />;
	}

	return (
		<pre className="overflow-x-auto rounded-md border border-white/10 bg-black/40 p-5 font-mono text-sm leading-7 text-zinc-100">
			{stringifyUnknown(payload)}
		</pre>
	);
}

export async function generateMetadata({
	params,
}: SharedPageProps): Promise<Metadata> {
	const { slug } = await params;
	const share = await getPublicShare(slug);
	if (!share) {
		return { title: "Shared Rox item" };
	}

	const payload = getPayload(share);
	const title = getPayloadTitle(payload, share.title);
	return {
		title,
		description: "Shared from Rox",
	};
}

export default async function SharedPage({ params }: SharedPageProps) {
	const { slug } = await params;
	const share = await getPublicShare(slug);
	if (!share) notFound();

	const payload = getPayload(share);
	const title = getPayloadTitle(payload, share.title);
	const publishedAt =
		toDateLabel(payload.publishedAt) ?? toDateLabel(share.createdAt);

	return (
		<main className="min-h-screen bg-black text-zinc-100">
			<div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-6 py-10">
				<header className="border-white/10 border-b pb-6">
					<p className="mb-4 font-mono text-sm text-zinc-500">Rox share</p>
					<h1 className="text-balance font-medium text-3xl text-white md:text-5xl">
						{title}
					</h1>
					<div className="mt-5 flex flex-wrap gap-3 text-sm text-zinc-500">
						<span>{share.resourceType.replace("_", " ")}</span>
						<span aria-hidden="true">/</span>
						<span className="font-mono">{share.slug}</span>
						{publishedAt ? (
							<>
								<span aria-hidden="true">/</span>
								<span>{publishedAt}</span>
							</>
						) : null}
					</div>
				</header>
				<SharedContent share={share} payload={payload} />
			</div>
		</main>
	);
}
