import { COMPANY } from "@rox/shared/constants";
import { alert } from "@rox/ui/atoms/Alert";
import { Button } from "@rox/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@rox/ui/dialog";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { Skeleton } from "@rox/ui/skeleton";
import { toast } from "@rox/ui/sonner";
import { useLiveQuery } from "@tanstack/react-db";
import { useState } from "react";
import {
	HiArrowTopRightOnSquare,
	HiOutlineClipboardDocument,
	HiOutlineKey,
	HiOutlinePlus,
	HiOutlineTrash,
} from "react-icons/hi2";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

interface ApiKeysSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function ApiKeysSettings({ visibleItems }: ApiKeysSettingsProps) {
	const collections = useCollections();
	const [isGenerating, setIsGenerating] = useState(false);
	const [showGenerateDialog, setShowGenerateDialog] = useState(false);
	const [showNewKeyDialog, setShowNewKeyDialog] = useState(false);
	const [newKeyName, setNewKeyName] = useState("");
	const [newKeyValue, setNewKeyValue] = useState("");
	const { data: apiKeysData, isReady } = useLiveQuery(
		(q) => q.from({ apiKeys: collections.apiKeys }),
		[collections],
	);
	const apiKeys = apiKeysData ?? [];

	const showApiKeysList = isItemVisible(
		SETTING_ITEM_ID.API_KEYS_LIST,
		visibleItems,
	);
	const showGenerateButton = isItemVisible(
		SETTING_ITEM_ID.API_KEYS_GENERATE,
		visibleItems,
	);

	const handleGenerateKey = async () => {
		if (!newKeyName.trim()) return;

		try {
			setIsGenerating(true);
			const result = await apiTrpcClient.apiKey.create.mutate({
				name: newKeyName.trim(),
			});
			if (result.key) {
				setNewKeyValue(result.key);
				setShowGenerateDialog(false);
				setShowNewKeyDialog(true);
				setNewKeyName("");
			}
		} catch (error) {
			console.error("[api-keys] Failed to generate API key:", error);
		} finally {
			setIsGenerating(false);
		}
	};

	const handleRevokeKey = (id: string, name: string | null) => {
		alert({
			title: "Отозвать API-ключ",
			description: `Вы уверены, что хотите отозвать "${name ?? "Безымянный ключ"}"? Это действие нельзя отменить.`,
			actions: [
				{ label: "Отмена", variant: "outline", onClick: () => {} },
				{
					label: "Отозвать",
					variant: "destructive",
					onClick: async () => {
						await authClient.apiKey.delete({ keyId: id });
						toast.success("API-ключ отозван");
					},
				},
			],
		});
	};

	const { copyToClipboard, copied } = useCopyToClipboard();
	const handleCopyKey = () => {
		copyToClipboard(newKeyValue);
	};

	const formatDate = (date: Date | string | null) => {
		if (!date) return "Никогда";
		const d = date instanceof Date ? date : new Date(date);
		return d.toLocaleDateString("ru-RU", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	};

	return (
		<div className="p-6 max-w-4xl w-full">
			<div className="mb-8 flex items-start justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold">API-ключи</h2>
					<p className="text-sm text-muted-foreground mt-1">
						Управляйте ключами для доступа к MCP-серверу и подключения внешних
						интеграций, таких как Claude Desktop или Claude Code.{" "}
						<a
							href={`${COMPANY.DOCS_URL}/mcp`}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1 text-primary hover:underline"
						>
							Подробнее
							<HiArrowTopRightOnSquare className="h-3 w-3" />
						</a>
					</p>
				</div>
				{showGenerateButton && (
					<Button
						onClick={() => setShowGenerateDialog(true)}
						size="sm"
						className="gap-2 shrink-0"
					>
						<HiOutlinePlus className="h-4 w-4" />
						Сгенерировать ключ
					</Button>
				)}
			</div>

			{showApiKeysList &&
				(!isReady && apiKeys.length === 0 ? (
					<div className="divide-y divide-border">
						{[1, 2, 3].map((i) => (
							<div key={i} className="flex items-center gap-4 py-3">
								<Skeleton className="h-4 w-4 rounded" />
								<div className="flex-1 space-y-2">
									<Skeleton className="h-4 w-48" />
									<Skeleton className="h-3 w-32" />
								</div>
							</div>
						))}
					</div>
				) : apiKeys.length === 0 ? (
					<div className="text-center py-12 text-sm text-muted-foreground">
						<HiOutlineKey className="h-8 w-8 mx-auto mb-3 opacity-50" />
						<p>API-ключей пока нет.</p>
						<p className="text-xs mt-1">
							Сгенерируйте ключ для использования с MCP-серверами.
						</p>
					</div>
				) : (
					<div className="divide-y divide-border">
						{apiKeys.map((key) => (
							<div
								key={key.id}
								className="group flex items-center justify-between gap-4 py-3"
							>
								<div className="flex items-center gap-3 min-w-0">
									<HiOutlineKey className="h-4 w-4 shrink-0 text-muted-foreground" />
									<div className="min-w-0">
										<div className="text-sm font-medium truncate">
											{key.name ?? "Безымянный ключ"}
										</div>
										<div className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
											{key.start ?? "sk_..."}
										</div>
									</div>
								</div>
								<div className="flex items-center gap-4 shrink-0">
									<div className="text-xs text-muted-foreground tabular-nums hidden sm:block">
										Создан {formatDate(key.createdAt)} · Последнее использование{" "}
										{formatDate(key.lastRequest)}
									</div>
									<Button
										variant="ghost"
										size="icon"
										className="h-8 w-8 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
										onClick={() => handleRevokeKey(key.id, key.name)}
										aria-label="Отозвать ключ"
									>
										<HiOutlineTrash className="h-4 w-4" />
									</Button>
								</div>
							</div>
						))}
					</div>
				))}

			<Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Сгенерировать API-ключ</DialogTitle>
						<DialogDescription>
							Создайте новый API-ключ для внешних интеграций, таких как Claude
							Desktop или Claude Code.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2 py-2">
						<Label htmlFor="key-name">Название ключа</Label>
						<Input
							id="key-name"
							placeholder="например, Claude Desktop"
							value={newKeyName}
							onChange={(e) => setNewKeyName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleGenerateKey();
							}}
						/>
						<p className="text-xs text-muted-foreground">
							Дайте ключу понятное название, чтобы помнить, где он используется.
						</p>
					</div>
					<DialogFooter>
						<Button
							variant="outline"
							onClick={() => setShowGenerateDialog(false)}
						>
							Отмена
						</Button>
						<Button
							onClick={handleGenerateKey}
							disabled={!newKeyName.trim() || isGenerating}
						>
							{isGenerating ? "Генерируется..." : "Сгенерировать ключ"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={showNewKeyDialog} onOpenChange={setShowNewKeyDialog}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>API-ключ сгенерирован</DialogTitle>
						<DialogDescription>
							Скопируйте ключ сейчас — вы больше не сможете увидеть его снова.
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2 py-2">
						<div className="relative">
							<Input readOnly value={newKeyValue} className="font-mono pr-10" />
							<Button
								variant="ghost"
								size="icon"
								className="absolute right-1 top-1 h-7 w-7"
								onClick={handleCopyKey}
								aria-label="Скопировать ключ"
							>
								<HiOutlineClipboardDocument className="h-4 w-4" />
							</Button>
						</div>
						{copied && (
							<p className="text-xs text-muted-foreground">
								Скопировано в буфер обмена.
							</p>
						)}
					</div>
					<DialogFooter>
						<Button onClick={() => setShowNewKeyDialog(false)}>Готово</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
