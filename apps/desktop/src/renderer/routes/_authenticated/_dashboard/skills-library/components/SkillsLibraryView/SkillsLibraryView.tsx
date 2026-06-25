import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@rox/ui/empty";
import { Input } from "@rox/ui/input";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { cn } from "@rox/ui/utils";
import { useMemo, useState } from "react";
import { LuLibrary, LuSearch } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { SkillDetailPane } from "./components/SkillDetailPane";

const SOURCE_LABELS: Record<string, string> = {
	claude: "~/.claude",
	agents: "~/.agents",
};

export function SkillsLibraryView() {
	const { data: skills, isLoading } = electronTrpc.skillsLibrary.list.useQuery(
		undefined,
		{ staleTime: 30_000 },
	);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [search, setSearch] = useState("");

	const filtered = useMemo(() => {
		const list = skills ?? [];
		const query = search.trim().toLowerCase();
		if (query.length === 0) return list;
		return list.filter(
			(skill) =>
				skill.name.toLowerCase().includes(query) ||
				skill.slug.toLowerCase().includes(query) ||
				(skill.description?.toLowerCase().includes(query) ?? false),
		);
	}, [skills, search]);

	const selected =
		filtered.find((skill) => skill.id === selectedId) ??
		(skills ?? []).find((skill) => skill.id === selectedId) ??
		null;

	return (
		<div className="flex h-full w-full flex-1 overflow-hidden">
			<aside className="flex h-full w-80 shrink-0 flex-col border-r border-border">
				<div className="flex flex-col gap-2 border-b border-border px-4 py-4">
					<div>
						<h1 className="text-lg font-semibold text-foreground">
							Библиотека скиллов
						</h1>
						<p className="text-sm text-muted-foreground">
							Установленные навыки агентов.
						</p>
					</div>
					<div className="relative">
						<LuSearch className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
						<Input
							data-onboarding-anchor="skill-search"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Поиск скиллов"
							className="pl-8"
						/>
					</div>
				</div>
				<div className="flex-1 overflow-y-auto p-2">
					{isLoading ? (
						<div className="flex flex-col gap-2 p-2">
							{Array.from({ length: 6 }).map((_, index) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
								<Skeleton key={index} className="h-12 w-full rounded-md" />
							))}
						</div>
					) : filtered.length === 0 ? (
						<p className="px-2 py-6 text-center text-sm text-muted-foreground">
							{(skills ?? []).length === 0
								? "Скиллы не найдены."
								: "Ничего не найдено."}
						</p>
					) : (
						<ul className="flex flex-col gap-0.5">
							{filtered.map((skill) => (
								<li key={skill.id}>
									<button
										type="button"
										onClick={() => setSelectedId(skill.id)}
										className={cn(
											"flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors",
											skill.id === selectedId
												? "bg-accent text-foreground"
												: "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
										)}
									>
										<span className="flex items-center gap-2">
											<span className="min-w-0 flex-1 truncate text-sm font-medium">
												{skill.name}
											</span>
											<span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
												{SOURCE_LABELS[skill.source] ?? skill.source}
											</span>
										</span>
										{skill.description && (
											<span className="line-clamp-2 text-xs text-muted-foreground/80">
												{skill.description}
											</span>
										)}
									</button>
								</li>
							))}
						</ul>
					)}
				</div>
			</aside>

			<section className="flex h-full min-w-0 flex-1 flex-col">
				{selected ? (
					<SkillDetailPane
						key={selected.id}
						skillId={selected.id}
						onSaved={() => toast.success("Файл скилла сохранён")}
					/>
				) : (
					<Empty className="m-auto">
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<LuLibrary className="size-6" />
							</EmptyMedia>
							<EmptyTitle>Выберите скилл</EmptyTitle>
							<EmptyDescription>
								Слева — список установленных навыков. Откройте любой, чтобы
								посмотреть и отредактировать его файлы.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
			</section>
		</div>
	);
}
