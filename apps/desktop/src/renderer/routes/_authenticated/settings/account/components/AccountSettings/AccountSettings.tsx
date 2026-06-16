import { Avatar } from "@rox/ui/atoms/Avatar";
import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { toast } from "@rox/ui/sonner";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useState } from "react";
import { apiTrpcClient } from "renderer/lib/api-trpc-client";
import { authClient } from "renderer/lib/auth-client";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	getImageExtensionFromMimeType,
	parseBase64DataUrl,
} from "shared/file-types";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { AccountUsagePanel } from "./components/AccountUsagePanel";
import { ProfilePublicSettings } from "./components/ProfilePublicSettings";
import { ProfileSkeleton } from "./components/ProfileSkeleton";

interface AccountSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function AccountSettings({ visibleItems }: AccountSettingsProps) {
	const showProfile = isItemVisible(
		SETTING_ITEM_ID.ACCOUNT_PROFILE,
		visibleItems,
	);
	const showSignOut = isItemVisible(
		SETTING_ITEM_ID.ACCOUNT_SIGNOUT,
		visibleItems,
	);
	const showUsage = isItemVisible(SETTING_ITEM_ID.ACCOUNT_USAGE, visibleItems);

	const { data: session } = authClient.useSession();
	const currentUserId = session?.user?.id;
	const collections = useCollections();

	const [nameValue, setNameValue] = useState("");
	const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

	const { data: usersData, isReady } = useLiveQuery(
		(q) => q.from({ users: collections.users }),
		[collections],
	);

	// Prefer the synced, org-scoped collection row when present (it carries the
	// freshest profile data). Fall back to the authenticated session user so the
	// Account tab still renders when the active org has no matching member row
	// (cache-first: never blank an existing row just because the collection is
	// not yet ready — see AGENTS.md #9).
	const syncedUser = usersData?.find((u) => u.id === currentUserId);
	const sessionUser = session?.user;
	const user =
		syncedUser ??
		(sessionUser
			? {
					id: sessionUser.id,
					name: sessionUser.name ?? "",
					email: sessionUser.email,
					image: sessionUser.image ?? null,
				}
			: undefined);

	const signOutMutation = electronTrpc.auth.signOut.useMutation({
		onSuccess: () => toast.success("Вы вышли из аккаунта"),
	});

	const selectImageMutation = electronTrpc.window.selectImageFile.useMutation();

	useEffect(() => {
		if (!user) return;
		setNameValue(user.name ?? "");
		setAvatarPreview(user.image ?? null);
	}, [user]);

	async function handleAvatarUpload() {
		if (!user) return;

		try {
			const result = await selectImageMutation.mutateAsync();
			if (result.canceled || !result.dataUrl) return;

			const { mimeType } = parseBase64DataUrl(result.dataUrl);
			const ext = getImageExtensionFromMimeType(mimeType) ?? "png";

			const uploadResult = await apiTrpcClient.user.uploadAvatar.mutate({
				fileData: result.dataUrl,
				fileName: `avatar.${ext}`,
				mimeType,
			});

			setAvatarPreview(uploadResult.url);
			toast.success("Аватар обновлён");
		} catch {
			toast.error("Не удалось обновить аватар");
		}
	}

	async function handleNameBlur() {
		if (!user || nameValue === user.name) return;

		if (!nameValue) {
			setNameValue(user.name ?? "");
			return;
		}

		try {
			await apiTrpcClient.user.updateProfile.mutate({ name: nameValue });
			toast.success("Имя обновлено");
		} catch {
			toast.error("Не удалось обновить имя");
			setNameValue(user.name ?? "");
		}
	}

	return (
		<div className="p-6 w-full">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Аккаунт</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Управляйте настройками аккаунта
				</p>
			</div>

			<div className="space-y-3">
				{showProfile && <ProfilePublicSettings />}

				{showProfile &&
					(!isReady && !user && !session ? (
						<ProfileSkeleton />
					) : user ? (
						<>
							<SettingRow label="Аватар" hint="Рекомендуемый размер 256×256.">
								<button
									type="button"
									onClick={handleAvatarUpload}
									disabled={selectImageMutation.isPending}
									className="rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-100"
									aria-label="Изменить аватар"
								>
									<Avatar
										size="xl"
										fullName={user.name}
										image={avatarPreview}
									/>
								</button>
							</SettingRow>

							<SettingRow label="Имя">
								<Input
									value={nameValue}
									onChange={(e) => setNameValue(e.target.value)}
									onBlur={handleNameBlur}
									placeholder="Ваше имя"
									className="w-80"
								/>
							</SettingRow>

							<SettingRow label="Электронная почта">
								<Input
									value={user.email}
									readOnly
									className="w-80 opacity-60"
								/>
							</SettingRow>
						</>
					) : (
						<p className="text-sm text-muted-foreground">
							Не удалось загрузить данные пользователя
						</p>
					))}

				{showUsage && <AccountUsagePanel />}

				{showSignOut && (
					<div className={showProfile ? "pt-5" : undefined}>
						<SettingRow
							label="Выйти из аккаунта на этом устройстве"
							hint="Чтобы пользоваться Rox на этом устройстве, нужно будет войти снова."
						>
							<Button
								variant="outline"
								onClick={() => signOutMutation.mutate()}
							>
								Выйти
							</Button>
						</SettingRow>
					</div>
				)}
			</div>
		</div>
	);
}

interface SettingRowProps {
	label: string;
	hint?: string;
	children: React.ReactNode;
}

function SettingRow({ label, hint, children }: SettingRowProps) {
	return (
		<div className="flex items-center justify-between gap-8">
			<div className="flex-1 min-w-0">
				<div className="text-sm font-medium">{label}</div>
				{hint && (
					<div className="text-xs text-muted-foreground mt-0.5">{hint}</div>
				)}
			</div>
			<div className="flex-shrink-0">{children}</div>
		</div>
	);
}
