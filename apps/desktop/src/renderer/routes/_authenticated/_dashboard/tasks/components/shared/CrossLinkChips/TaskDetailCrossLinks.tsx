import { Button } from "@rox/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@rox/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@rox/ui/popover";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { GoGitPullRequest, GoIssueOpened } from "react-icons/go";
import { LuLink } from "react-icons/lu";
import { useTaskLinks } from "../../../linkage";
import {
	useIssueSearch,
	usePullRequestSearch,
} from "../../TasksView/components/shared/github";
import { CrossLinkChip } from "./CrossLinkChip";

interface TaskDetailCrossLinksProps {
	taskId: string;
	projectId: string | null;
}

/**
 * Cross-chip surface on the task detail (`$taskId`). Renders the task's linked
 * PRs/issues as clickable chips that navigate to the PR/issue detail, plus a
 * picker (search the project's open PRs/issues) to add a new link. Backed by
 * the headless `useTaskLinks` model on `@tanstack/react-db`.
 */
export function TaskDetailCrossLinks({
	taskId,
	projectId,
}: TaskDetailCrossLinksProps) {
	const navigate = useNavigate();
	const { linksForTask, upsertLink, removeLink } = useTaskLinks({ taskId });
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");

	const { pullRequests } = usePullRequestSearch(projectId, search, "open");
	const { issues } = useIssueSearch(projectId, search, "open");

	if (!projectId) return null;

	const goToPr = (prNumber: number) =>
		navigate({
			to: "/tasks/pr/$prNumber",
			params: { prNumber: String(prNumber) },
			search: { project: projectId },
		});
	const goToIssue = (issueNumber: number) =>
		navigate({
			to: "/tasks/issue/$issueNumber",
			params: { issueNumber: String(issueNumber) },
			search: { project: projectId },
		});

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{linksForTask.map((link) => (
				<CrossLinkChip
					key={link.id}
					kind={link.kind}
					number={link.targetNumber}
					label={link.targetTitle}
					onClick={() =>
						link.kind === "pr"
							? goToPr(link.targetNumber)
							: goToIssue(link.targetNumber)
					}
					onRemove={() => removeLink(link.id)}
				/>
			))}

			<Popover
				open={open}
				onOpenChange={(next) => {
					setOpen(next);
					if (!next) setSearch("");
				}}
			>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className="h-6 gap-1 px-2 text-[11px]"
					>
						<LuLink className="size-3" />
						Связать
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-80 p-0" align="start">
					<Command shouldFilter={false}>
						<CommandInput
							placeholder="Поиск PR / Issue…"
							value={search}
							onValueChange={setSearch}
						/>
						<CommandList>
							<CommandEmpty>Ничего не найдено.</CommandEmpty>
							{pullRequests.length > 0 && (
								<CommandGroup heading="Pull requests">
									{pullRequests.slice(0, 8).map((pr) => (
										<CommandItem
											key={`pr-${pr.prNumber}`}
											value={`pr-${pr.prNumber}`}
											onSelect={() => {
												upsertLink({
													projectId,
													taskId,
													kind: "pr",
													targetNumber: pr.prNumber,
													targetTitle: pr.title,
													targetUrl: pr.url,
												});
												setOpen(false);
												setSearch("");
											}}
										>
											<GoGitPullRequest className="size-4" />
											<span className="font-mono text-xs tabular-nums">
												#{pr.prNumber}
											</span>
											<span className="truncate">{pr.title}</span>
										</CommandItem>
									))}
								</CommandGroup>
							)}
							{issues.length > 0 && (
								<CommandGroup heading="Issues">
									{issues.slice(0, 8).map((issue) => (
										<CommandItem
											key={`issue-${issue.issueNumber}`}
											value={`issue-${issue.issueNumber}`}
											onSelect={() => {
												upsertLink({
													projectId,
													taskId,
													kind: "issue",
													targetNumber: issue.issueNumber,
													targetTitle: issue.title,
													targetUrl: issue.url,
												});
												setOpen(false);
												setSearch("");
											}}
										>
											<GoIssueOpened className="size-4" />
											<span className="font-mono text-xs tabular-nums">
												#{issue.issueNumber}
											</span>
											<span className="truncate">{issue.title}</span>
										</CommandItem>
									))}
								</CommandGroup>
							)}
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}
