import type { BranchPrefixMode } from "@rox/local-db";
import {
	DEFAULT_SETTINGS_BRANCH_PREFIX_CUSTOM,
	DEFAULT_SETTINGS_BRANCH_PREFIX_MODE,
} from "@rox/local-db/schema";
import {
	resolveBranchPrefix,
	sanitizeSegment,
} from "@rox/shared/workspace-launch";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@rox/ui/select";
import { Switch } from "@rox/ui/switch";
import { useEffect, useState } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { logger } from "renderer/lib/logger";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { UserWorktreeLocationSection } from "./components/UserWorktreeLocationSection";

interface GitSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

const BRANCH_PREFIX_MODE_LABELS_RU = {
	none: "Без префикса",
	github: "Имя пользователя GitHub",
	author: "Имя автора Git",
	custom: "Свой префикс",
} satisfies Record<BranchPrefixMode, string>;

export function GitSettings({ visibleItems }: GitSettingsProps) {
	const showDeleteLocalBranch = isItemVisible(
		SETTING_ITEM_ID.GIT_DELETE_LOCAL_BRANCH,
		visibleItems,
	);
	const showBranchPrefix = isItemVisible(
		SETTING_ITEM_ID.GIT_BRANCH_PREFIX,
		visibleItems,
	);
	const showWorktreeLocation = isItemVisible(
		SETTING_ITEM_ID.GIT_WORKTREE_LOCATION,
		visibleItems,
	);

	const utils = electronTrpc.useUtils();

	const { data: deleteLocalBranch, isLoading: isDeleteBranchLoading } =
		electronTrpc.settings.getDeleteLocalBranch.useQuery();
	const setDeleteLocalBranch =
		electronTrpc.settings.setDeleteLocalBranch.useMutation({
			onMutate: async ({ enabled }) => {
				await utils.settings.getDeleteLocalBranch.cancel();
				const previous = utils.settings.getDeleteLocalBranch.getData();
				utils.settings.getDeleteLocalBranch.setData(undefined, enabled);
				return { previous };
			},
			onError: (_err, _vars, context) => {
				if (context?.previous !== undefined) {
					utils.settings.getDeleteLocalBranch.setData(
						undefined,
						context.previous,
					);
				}
			},
			onSettled: () => {
				utils.settings.getDeleteLocalBranch.invalidate();
			},
		});

	const handleDeleteBranchToggle = (enabled: boolean) => {
		setDeleteLocalBranch.mutate({ enabled });
	};

	const { data: branchPrefix, isLoading: isBranchPrefixLoading } =
		electronTrpc.settings.getBranchPrefix.useQuery();
	const { data: gitInfo } = electronTrpc.settings.getGitInfo.useQuery();
	const branchPrefixMode =
		branchPrefix?.mode ?? DEFAULT_SETTINGS_BRANCH_PREFIX_MODE;
	const branchPrefixCustom =
		branchPrefix?.customPrefix ?? DEFAULT_SETTINGS_BRANCH_PREFIX_CUSTOM;

	const [customPrefixInput, setCustomPrefixInput] =
		useState(branchPrefixCustom);

	useEffect(() => {
		setCustomPrefixInput(
			branchPrefix?.customPrefix ?? DEFAULT_SETTINGS_BRANCH_PREFIX_CUSTOM,
		);
	}, [branchPrefix?.customPrefix]);

	const setBranchPrefix = electronTrpc.settings.setBranchPrefix.useMutation({
		onError: (err) => {
			logger.error("[settings/branch-prefix] Failed to update:", err);
		},
		onSettled: () => {
			utils.settings.getBranchPrefix.invalidate();
		},
	});

	const handleBranchPrefixModeChange = (mode: BranchPrefixMode) => {
		setBranchPrefix.mutate({
			mode,
			customPrefix: customPrefixInput || null,
		});
	};

	const handleCustomPrefixBlur = () => {
		const sanitized = sanitizeSegment(customPrefixInput);
		setCustomPrefixInput(sanitized);
		setBranchPrefix.mutate({
			mode: "custom",
			customPrefix: sanitized || null,
		});
	};

	const previewPrefix =
		resolveBranchPrefix({
			mode: branchPrefixMode,
			customPrefix: customPrefixInput,
			authorPrefix: gitInfo?.authorPrefix,
			githubUsername: gitInfo?.githubUsername,
		}) ||
		(branchPrefixMode === "author"
			? "author-name"
			: branchPrefixMode === "github"
				? "username"
				: null);

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Git и worktree</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Настройте поведение веток Git и worktree
				</p>
			</div>

			<div className="space-y-6">
				{showDeleteLocalBranch && (
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label
								htmlFor="delete-local-branch"
								className="text-sm font-medium"
							>
								Удалять локальную ветку при удалении рабочего пространства
							</Label>
							<p className="text-xs text-muted-foreground">
								Также удалять локальную ветку Git при удалении рабочего
								пространства worktree
							</p>
						</div>
						<Switch
							id="delete-local-branch"
							checked={deleteLocalBranch ?? false}
							onCheckedChange={handleDeleteBranchToggle}
							disabled={isDeleteBranchLoading || setDeleteLocalBranch.isPending}
						/>
					</div>
				)}

				{showBranchPrefix && (
					<div className="flex items-center justify-between">
						<div className="space-y-0.5">
							<Label className="text-sm font-medium">Префикс ветки</Label>
							<p className="text-xs text-muted-foreground">
								Группируйте новые ветки в папке.{" "}
								<code className="bg-muted px-1.5 py-0.5 rounded text-foreground">
									{previewPrefix
										? `${previewPrefix}/branch-name`
										: "branch-name"}
								</code>
							</p>
						</div>
						<div className="flex items-center gap-2">
							<Select
								value={branchPrefixMode}
								onValueChange={(value) =>
									handleBranchPrefixModeChange(value as BranchPrefixMode)
								}
								disabled={isBranchPrefixLoading || setBranchPrefix.isPending}
							>
								<SelectTrigger className="w-[180px]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{(
										Object.entries(BRANCH_PREFIX_MODE_LABELS_RU) as [
											BranchPrefixMode,
											string,
										][]
									).map(([value, label]) => (
										<SelectItem key={value} value={value}>
											{label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{branchPrefixMode === "custom" && (
								<Input
									placeholder="Префикс"
									value={customPrefixInput}
									onChange={(e) => setCustomPrefixInput(e.target.value)}
									onBlur={handleCustomPrefixBlur}
									className="w-[120px]"
									disabled={isBranchPrefixLoading || setBranchPrefix.isPending}
								/>
							)}
						</div>
					</div>
				)}

				{showWorktreeLocation && <UserWorktreeLocationSection />}
			</div>
		</div>
	);
}
