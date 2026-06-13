import type { SelectUser } from "@rox/db/schema";
import { Avatar } from "@rox/ui/atoms/Avatar";
import { Button } from "@rox/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@rox/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@rox/ui/popover";
import { useLiveQuery } from "@tanstack/react-db";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HiCheck, HiChevronDown, HiOutlineUserCircle } from "react-icons/hi2";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

type Tab = "all" | "internal" | "external";

interface AssigneeFilterProps {
	value: string | null;
	onChange: (value: string | null) => void;
}

export function AssigneeFilter({ value, onChange }: AssigneeFilterProps) {
	const collections = useCollections();
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [tab, setTab] = useState<Tab>("all");

	const { data: allUsers } = useLiveQuery(
		(q) => q.from({ users: collections.users }),
		[collections],
	);

	const users = useMemo(() => allUsers || [], [allUsers]);

	const { data: allTasks } = useLiveQuery(
		(q) => q.from({ tasks: collections.tasks }),
		[collections],
	);

	const externalAssignees = useMemo(() => {
		if (!allTasks) return [];
		const seen = new Map<
			string,
			{ id: string; name: string | null; avatar: string | null }
		>();
		for (const t of allTasks) {
			if (t.assigneeExternalId && !seen.has(t.assigneeExternalId)) {
				seen.set(t.assigneeExternalId, {
					id: t.assigneeExternalId,
					name: t.assigneeDisplayName,
					avatar: t.assigneeAvatarUrl,
				});
			}
		}
		return [...seen.values()];
	}, [allTasks]);

	const selectedUser = useMemo(() => {
		if (value === null) return null;
		if (value === "unassigned")
			return { id: "unassigned", name: "Без исполнителя" };
		if (value.startsWith("ext:")) {
			const extId = value.slice(4);
			const ext = externalAssignees.find((e) => e.id === extId);
			return ext
				? { id: value, name: ext.name || "Внешний", image: ext.avatar }
				: null;
		}
		return users.find((u) => u.id === value) || null;
	}, [value, users, externalAssignees]);

	const query = search.toLowerCase();

	const filteredUsers = useMemo(
		() =>
			users.filter(
				(u) =>
					u.name?.toLowerCase().includes(query) ||
					u.email?.toLowerCase().includes(query),
			),
		[users, query],
	);

	const filteredExternal = useMemo(
		() =>
			externalAssignees.filter(
				(e) => !query || e.name?.toLowerCase().includes(query),
			),
		[externalAssignees, query],
	);

	const visibleUsers = tab === "external" ? [] : filteredUsers;
	const visibleExternal = tab === "internal" ? [] : filteredExternal;
	const hasResults = visibleUsers.length > 0 || visibleExternal.length > 0;

	const [canScroll, setCanScroll] = useState(false);
	const listRef = useRef<HTMLDivElement>(null);

	const checkScroll = useCallback(() => {
		const el = listRef.current;
		if (!el) return;
		const hasOverflow = el.scrollHeight > el.clientHeight;
		const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
		setCanScroll(hasOverflow && !atBottom);
	}, []);

	useEffect(() => {
		checkScroll();
	}, [checkScroll]);

	const handleSelect = (userId: string | null) => {
		onChange(userId);
		setOpen(false);
	};

	const handleOpenChange = (next: boolean) => {
		setOpen(next);
		if (!next) {
			setSearch("");
			setTab("all");
		}
	};

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					title={selectedUser?.name ?? "Исполнитель"}
					aria-label={selectedUser?.name ?? "Исполнитель"}
					className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
				>
					{selectedUser ? (
						<>
							{selectedUser.id === "unassigned" ? (
								<HiOutlineUserCircle className="size-4" />
							) : (
								<Avatar
									size="xs"
									fullName={(selectedUser as SelectUser).name}
									image={(selectedUser as SelectUser).image}
								/>
							)}
							<span className="text-sm hidden @4xl:inline">
								{selectedUser.name}
							</span>
						</>
					) : (
						<>
							<HiOutlineUserCircle className="size-4" />
							<span className="text-sm hidden @4xl:inline">Исполнитель</span>
						</>
					)}
					<HiChevronDown className="size-3" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-60 p-0">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Поиск людей..."
						value={search}
						onValueChange={setSearch}
					/>
					<div className="flex items-center gap-0.5 border-b px-2 py-1.5">
						{(["all", "internal", "external"] as const).map((t) => (
							<button
								key={t}
								type="button"
								onClick={() => setTab(t)}
								className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
									tab === t
										? "bg-accent text-accent-foreground"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								{t === "all"
									? "Все"
									: t === "internal"
										? "Внутренние"
										: "Внешние"}
							</button>
						))}
					</div>
					<div className="relative">
						<CommandList
							ref={listRef}
							className="max-h-80"
							onScroll={checkScroll}
						>
							<CommandGroup>
								<CommandItem onSelect={() => handleSelect(null)}>
									<span className="text-sm">Все исполнители</span>
									{value === null && <HiCheck className="ml-auto size-3.5" />}
								</CommandItem>
								<CommandItem onSelect={() => handleSelect("unassigned")}>
									<HiOutlineUserCircle className="size-4" />
									<span className="text-sm">Без исполнителя</span>
									{value === "unassigned" && (
										<HiCheck className="ml-auto size-3.5" />
									)}
								</CommandItem>
							</CommandGroup>

							{!hasResults && search && (
								<CommandEmpty>Люди не найдены.</CommandEmpty>
							)}

							{visibleUsers.length > 0 && (
								<>
									<CommandSeparator />
									<CommandGroup
										heading={
											tab === "all" && visibleExternal.length > 0
												? "Внутренние"
												: undefined
										}
									>
										{visibleUsers.map((user) => (
											<CommandItem
												key={user.id}
												onSelect={() => handleSelect(user.id)}
											>
												<Avatar
													size="xs"
													fullName={user.name}
													image={user.image}
												/>
												<div className="flex flex-col min-w-0">
													<span className="text-sm truncate">{user.name}</span>
													<span className="text-xs text-muted-foreground truncate">
														{user.email}
													</span>
												</div>
												{user.id === value && (
													<HiCheck className="ml-auto size-3.5 shrink-0" />
												)}
											</CommandItem>
										))}
									</CommandGroup>
								</>
							)}

							{visibleExternal.length > 0 && (
								<>
									<CommandSeparator />
									<CommandGroup
										heading={
											tab === "all" && visibleUsers.length > 0
												? "Внешние"
												: undefined
										}
									>
										{visibleExternal.map((ext) => (
											<CommandItem
												key={ext.id}
												onSelect={() => handleSelect(`ext:${ext.id}`)}
											>
												<Avatar
													size="xs"
													fullName={ext.name || "Внешний"}
													image={ext.avatar}
												/>
												<span className="text-sm truncate">
													{ext.name || "Внешний"}
												</span>
												{value === `ext:${ext.id}` && (
													<HiCheck className="ml-auto size-3.5 shrink-0" />
												)}
											</CommandItem>
										))}
									</CommandGroup>
								</>
							)}
						</CommandList>
						{canScroll && (
							<div
								className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-popover to-transparent"
								aria-hidden="true"
							/>
						)}
					</div>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
