/**
 * Project templates catalog (`templates.marketplace`) — the cross-platform,
 * serializable source of truth for the Rox project templates the marketplace
 * browses. Dependency-free (no React `IconType`, no banner asset imports) so it
 * is shared by every client surface: the web `(agents)` marketplace renders it,
 * and it stays structurally compatible with the desktop `ProjectTemplate` and
 * the shared `TemplatePreviewInput` (so the same entries feed the
 * preview-sandbox / permissions-manifest derivations). The desktop renderer
 * keeps its own icon/banner binding over the SAME ids; this module owns the
 * platform-agnostic data (id/name/description/repo/presets) + render hints
 * (`iconKey`, `accentClassName`) that any platform can map to its own icon set.
 *
 * Same inline-mirror pattern as `template-preview-sandbox.ts` (`TemplatePreviewInput`)
 * and `crm-contacts.ts` (`EntityKind`): the runtime engine is the source of
 * truth for behavior; this is the catalog of what is offered.
 */

import type { TemplatePreviewInput } from "./template-preview-sandbox";

/**
 * A stable, platform-agnostic icon token. Each client maps it to its own icon
 * component (the web marketplace maps it to a `lucide-react` icon; the desktop
 * gallery maps the same id to a `react-icons` icon). Keeping it a string keeps
 * `@rox/shared` free of any UI-library dependency.
 */
export type TemplateIconKey =
	| "layers"
	| "globe"
	| "message"
	| "smartphone"
	| "boxes"
	| "flame"
	| "rocket"
	| "server";

/**
 * A project template entry. Extends the serializable {@link TemplatePreviewInput}
 * (so it composes with the preview-sandbox / permissions-manifest derivations)
 * with the render hints a marketplace card needs.
 */
export interface ProjectTemplateEntry extends TemplatePreviewInput {
	/** Platform-agnostic icon token (mapped to a concrete icon per client). */
	iconKey: TemplateIconKey;
	/** Tailwind accent classes for the card's icon chip (shared by all clients). */
	accentClassName: string;
}

/**
 * The Rox project templates, mirroring the desktop gallery catalog 1:1 (same
 * ids/names/descriptions/repos/presets). Repo-backed entries clone a remote;
 * preset-only entries initialise an empty git workspace with starter presets.
 */
export const PROJECT_TEMPLATE_ENTRIES: readonly ProjectTemplateEntry[] = [
	{
		id: "gstack",
		name: "gstack",
		description: "Ролевой воркфлоу Claude Code от Гэрри Тана",
		iconKey: "layers",
		accentClassName: "bg-zinc-900 text-white",
		repo: "https://github.com/garrytan/gstack",
	},
	{
		id: "nextjs",
		name: "Next.js",
		description: "Стартер от Vercel с Drizzle, NextAuth и Postgres",
		iconKey: "globe",
		accentClassName: "bg-black text-white",
		repo: "https://github.com/vercel/nextjs-postgres-auth-starter",
	},
	{
		id: "nextjs-chatbot",
		name: "Next.js Chatbot",
		description: "ИИ-чатбот на Next.js и AI SDK",
		iconKey: "message",
		accentClassName: "bg-black text-white",
		repo: "https://github.com/vercel/ai-chatbot",
	},
	{
		id: "react-native",
		name: "React Native",
		description: "Кроссплатформенное мобильное приложение на Expo",
		iconKey: "smartphone",
		accentClassName: "bg-blue-500 text-white",
		repo: "https://github.com/expo/expo-template-default",
	},
	{
		id: "t3-turbo",
		name: "T3 Turbo",
		description: "Фуллстек-монорепо на Turborepo с Next.js, Expo и tRPC",
		iconKey: "boxes",
		accentClassName: "bg-purple-700 text-white",
		repo: "https://github.com/t3-oss/create-t3-turbo",
	},
	{
		id: "hono",
		name: "React Router + Hono",
		description: "Фуллстек-шаблон на Cloudflare Workers",
		iconKey: "flame",
		accentClassName: "bg-orange-600 text-white",
		repo: "https://github.com/cloudflare/react-router-hono-fullstack-template",
	},
	{
		id: "remix",
		name: "Remix",
		description: "Фуллстек-стартер Remix (Indie Stack)",
		iconKey: "rocket",
		accentClassName: "bg-sky-600 text-white",
		repo: "https://github.com/remix-run/indie-stack",
	},
	{
		id: "fastapi",
		name: "FastAPI",
		description: "Фуллстек FastAPI + React + PostgreSQL",
		iconKey: "server",
		accentClassName: "bg-teal-700 text-white",
		repo: "https://github.com/fastapi/full-stack-fastapi-template",
	},
	{
		id: "strategy-brief",
		name: "Strategy brief",
		description:
			"Пустой git-проект с README, spec и planner для продуктовой стратегии",
		iconKey: "layers",
		accentClassName: "bg-emerald-700 text-white",
		starterPresetIds: ["docs-first-bootstrap", "agent-planning-kit"],
		defaultProjectName: "strategy-brief",
	},
	{
		id: "seo-content-hub",
		name: "SEO content hub",
		description: "Контент-план, TODO и агентный контекст для SEO/AEO работы",
		iconKey: "globe",
		accentClassName: "bg-cyan-700 text-white",
		starterPresetIds: [
			"minimal-readme-gitignore",
			"planning-docs",
			"agent-context-scaffold",
		],
		defaultProjectName: "seo-content-hub",
	},
	{
		id: "ops-analytics",
		name: "Ops analytics",
		description:
			"Операционный workspace с planner, env baseline и task tracker",
		iconKey: "boxes",
		accentClassName: "bg-slate-800 text-white",
		starterPresetIds: [
			"docs-first-bootstrap",
			"task-tracker-lite",
			"env-config",
		],
		defaultProjectName: "ops-analytics",
	},
];

/**
 * Whether a template can actually create a project: it either clones a repo or
 * applies at least one starter preset. Mirrors the desktop marketplace's
 * `isTemplateUsable` gate so an offered card is never a dead end.
 */
export function isTemplateEntryUsable(template: ProjectTemplateEntry): boolean {
	return Boolean(template.repo) || Boolean(template.starterPresetIds?.length);
}

/** How a template would materialise a project (repo clone vs empty workspace). */
export type TemplateCreateMode = "clone-repo" | "empty-git-workspace";

/** The create mode a template implies, derived from whether it has a repo. */
export function templateCreateMode(
	template: ProjectTemplateEntry,
): TemplateCreateMode {
	return template.repo ? "clone-repo" : "empty-git-workspace";
}
