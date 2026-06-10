import { cn } from "@rox/ui/utils";
import { useState } from "react";
import {
	LuBraces,
	LuGlobe,
	LuLayoutDashboard,
	LuLoader,
	LuMessageSquare,
	LuServer,
	LuSmartphone,
	LuTerminal,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useProjectCreationHandler } from "../../hooks/useProjectCreationHandler";

const TEMPLATES = [
	{
		name: "Чатбот на Next.js",
		description: "AI-чатбот на Next.js и AI SDK",
		icon: LuMessageSquare,
		color: "text-white bg-black",
		repo: "https://github.com/vercel/chatbot",
	},
	{
		name: "Next.js",
		description: "Full-stack React-фреймворк с SSR и API-роутами",
		icon: LuGlobe,
		color: "text-white bg-black",
	},
	{
		name: "Vite + React",
		description: "Быстрый инструмент сборки с React и TypeScript",
		icon: LuBraces,
		color: "text-white bg-violet-500",
	},
	{
		name: "Express API",
		description: "Минимальный REST API-сервер на Node.js",
		icon: LuServer,
		color: "text-white bg-green-600",
	},
	{
		name: "Astro",
		description: "Генератор статических сайтов для контентных проектов",
		icon: LuLayoutDashboard,
		color: "text-white bg-orange-500",
	},
	{
		name: "React Native",
		description: "Кроссплатформенное мобильное приложение на Expo",
		icon: LuSmartphone,
		color: "text-white bg-blue-500",
	},
	{
		name: "CLI-инструмент",
		description: "Консольное приложение на TypeScript",
		icon: LuTerminal,
		color: "text-white bg-zinc-700",
	},
];

interface TemplateTabProps {
	onError: (error: string) => void;
	parentDir: string;
}

export function TemplateTab({ onError, parentDir }: TemplateTabProps) {
	const [cloningTemplate, setCloningTemplate] = useState<string | null>(null);
	const cloneRepo = electronTrpc.projects.cloneRepo.useMutation();
	const { handleResult, handleError } = useProjectCreationHandler(onError);

	const handleTemplateClick = (template: (typeof TEMPLATES)[number]) => {
		if (!template.repo) return;
		if (!parentDir.trim()) {
			onError("Выберите расположение проекта");
			return;
		}

		setCloningTemplate(template.name);
		cloneRepo.mutate(
			{ url: template.repo, targetDirectory: parentDir.trim() },
			{
				onSuccess: (result) => {
					setCloningTemplate(null);
					handleResult(result);
				},
				onError: (err) => {
					setCloningTemplate(null);
					handleError(err);
				},
			},
		);
	};

	return (
		<div className="grid grid-cols-2 gap-3">
			{TEMPLATES.map((template) => {
				const hasRepo = !!template.repo;
				const isCloning = cloningTemplate === template.name;
				return (
					<button
						key={template.name}
						type="button"
						disabled={!hasRepo || cloneRepo.isPending}
						onClick={() => handleTemplateClick(template)}
						className={cn(
							"flex items-start gap-3 rounded-lg border border-border/50 p-3.5 text-left",
							hasRepo && !cloneRepo.isPending
								? "hover:border-border hover:bg-accent/30 cursor-pointer"
								: "opacity-60 cursor-not-allowed",
						)}
					>
						<div
							className={cn(
								"flex items-center justify-center size-9 rounded-lg shrink-0",
								template.color,
							)}
						>
							{isCloning ? (
								<LuLoader className="size-4.5 animate-spin" />
							) : (
								<template.icon className="size-4.5" />
							)}
						</div>
						<div className="min-w-0">
							<div className="text-sm font-medium text-foreground">
								{template.name}
							</div>
							<div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
								{isCloning ? "Клонируем..." : template.description}
							</div>
						</div>
					</button>
				);
			})}
			<div className="col-span-2 text-center py-2">
				<p className="text-xs text-muted-foreground">
					Скоро появятся новые шаблоны
				</p>
			</div>
		</div>
	);
}
