import {
	EXPERIMENTAL_FEATURE_CATEGORIES,
	EXPERIMENTAL_FEATURE_CATEGORY_LABELS,
	EXPERIMENTAL_FEATURES,
	type ExperimentalFeatureAvailability,
	type ExperimentalFeatureId,
	type ExperimentalFeatureMaturity,
	type ExperimentalFeatureState,
} from "@rox/shared/experimental-features";
import { Badge } from "@rox/ui/badge";
import { Button } from "@rox/ui/button";
import { Input } from "@rox/ui/input";
import { Label } from "@rox/ui/label";
import { toast } from "@rox/ui/sonner";
import { Switch } from "@rox/ui/switch";
import { useMemo, useState } from "react";
import { HiOutlineArrowPath, HiOutlineMagnifyingGlass } from "react-icons/hi2";
import { track } from "renderer/lib/analytics";
import { electronTrpc } from "renderer/lib/electron-trpc";

const AVAILABILITY_LABEL: Record<ExperimentalFeatureAvailability, string> = {
	available: "Available",
	blocked: "Blocked",
	needs_configuration: "Needs config",
	not_implemented: "Stubbed",
};

const AVAILABILITY_CLASS: Record<ExperimentalFeatureAvailability, string> = {
	available: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
	blocked: "border-destructive/50 text-destructive",
	needs_configuration: "border-amber-500/50 text-amber-700 dark:text-amber-300",
	not_implemented: "border-sky-500/40 text-sky-700 dark:text-sky-300",
};

const MATURITY_LABEL: Record<ExperimentalFeatureMaturity, string> = {
	alpha: "Alpha",
	beta: "Beta",
	preview: "Preview",
};

const LAUNCHPAD_ITEMS = [
	{
		featureId: "agentNative.sourceMarketplace",
		title: "Agent Sources",
		description: "Attach Agent-Native sources to composer and agent runs.",
	},
	{
		featureId: "templates.marketplace",
		title: "Template Gallery",
		description: "Browse and apply Agent-Native templates.",
	},
	{
		featureId: "collaboration.presence",
		title: "Collaboration Rooms",
		description: "Open shared Liveblocks-ready work rooms.",
	},
	{
		featureId: "live.voiceRooms",
		title: "Live Operations",
		description: "Start LiveKit-backed voice and agent rooms.",
	},
	{
		featureId: "projectOs.workspaceShell",
		title: "Project OS",
		description:
			"Navigate object-linked tasks, chats, calls, and roadmap data.",
	},
	{
		featureId: "rooms.operationsCommandCenter",
		title: "Combined Workflows",
		description:
			"Run cross-provider operating rooms with agents and live context.",
	},
] as const satisfies readonly {
	description: string;
	featureId: ExperimentalFeatureId;
	title: string;
}[];

function getDefaultState(id: ExperimentalFeatureId): ExperimentalFeatureState {
	return {
		id,
		enabled: true,
		defaultEnabled: true,
		userOverride: null,
		availability: "not_implemented",
		reason: "Loading effective state.",
		dependencies: [],
	};
}

function normalizeSearch(value: string) {
	return value.trim().toLowerCase();
}

function featureCardId(id: ExperimentalFeatureId): string {
	return `experimental-feature-card-${id.replaceAll(".", "-")}`;
}

export function ExperimentalFeatureCatalog() {
	const [searchQuery, setSearchQuery] = useState("");
	const utils = electronTrpc.useUtils();
	const statesQuery =
		electronTrpc.settings.experimentalFeatures.list.useQuery();
	const setOverride =
		electronTrpc.settings.experimentalFeatures.setOverride.useMutation({
			onSuccess: async (_state, variables) => {
				await utils.settings.experimentalFeatures.list.invalidate();
				const definition = EXPERIMENTAL_FEATURES.find(
					(feature) => feature.id === variables.id,
				);
				if (definition) {
					track(definition.telemetryEvent, { enabled: variables.enabled });
				}
			},
			onError: (error) => {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to update experimental feature",
				);
			},
		});
	const resetAll =
		electronTrpc.settings.experimentalFeatures.resetAll.useMutation({
			onSuccess: async () => {
				await utils.settings.experimentalFeatures.list.invalidate();
				toast.success("Experimental features reset to defaults");
			},
			onError: (error) => {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to reset experimental features",
				);
			},
		});

	const statesById = useMemo(
		() =>
			new Map(
				(statesQuery.data ?? []).map((state) => [
					state.id,
					state as ExperimentalFeatureState,
				]),
			),
		[statesQuery.data],
	);

	const normalizedSearch = normalizeSearch(searchQuery);
	const visibleFeatures = useMemo(() => {
		if (!normalizedSearch) return EXPERIMENTAL_FEATURES;
		return EXPERIMENTAL_FEATURES.filter((feature) => {
			const haystack = [
				feature.id,
				feature.title,
				feature.shortDescription,
				feature.longDescription,
				feature.category,
				...feature.affectedSurfaces,
				...feature.dependencies.map((dependency) => dependency.label),
			]
				.join(" ")
				.toLowerCase();
			return haystack.includes(normalizedSearch);
		});
	}, [normalizedSearch]);

	const totalEnabled = Array.from(statesById.values()).filter(
		(state) => state.enabled,
	).length;
	const fallbackEnabled = statesQuery.data
		? totalEnabled
		: EXPERIMENTAL_FEATURES.length;

	function openLaunchpadFeature(id: ExperimentalFeatureId) {
		const card = document.getElementById(featureCardId(id));
		card?.scrollIntoView({ block: "center", behavior: "smooth" });
		card?.focus({ preventScroll: true });
	}

	return (
		<section className="space-y-5">
			<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
				<div className="space-y-1">
					<Label className="text-sm font-medium">
						Agent-Native Team OS controls
					</Label>
					<p className="text-xs text-muted-foreground">
						All planned capabilities are enabled by default. Disable a feature
						here to hide its entry points or keep it inactive while provider
						configuration is missing.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Badge variant="outline">
						{fallbackEnabled}/{EXPERIMENTAL_FEATURES.length} on
					</Badge>
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => resetAll.mutate()}
						disabled={resetAll.isPending || setOverride.isPending}
					>
						<HiOutlineArrowPath className="size-4" aria-hidden />
						Reset all
					</Button>
				</div>
			</div>

			<div className="relative">
				<HiOutlineMagnifyingGlass
					className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
					aria-hidden
				/>
				<Input
					value={searchQuery}
					onChange={(event) => setSearchQuery(event.target.value)}
					placeholder="Search experiments, providers, surfaces..."
					className="pl-9"
				/>
			</div>

			<div className="space-y-3 rounded-md border p-4">
				<div className="space-y-1">
					<h3 className="text-sm font-semibold">Gated entry points</h3>
					<p className="text-xs text-muted-foreground">
						These launch surfaces read the same toggles. Disabled features stay
						hidden or inactive outside this control plane.
					</p>
				</div>
				<div className="grid gap-3 md:grid-cols-2">
					{LAUNCHPAD_ITEMS.map((item) => {
						const state =
							statesById.get(item.featureId) ?? getDefaultState(item.featureId);
						const isDisabled =
							!state.enabled || state.availability !== "available";
						const actionLabel = !state.enabled
							? "Disabled"
							: state.availability === "needs_configuration"
								? "Configure"
								: state.availability === "blocked"
									? "Blocked"
									: state.availability === "not_implemented"
										? "Coming soon"
										: "Open";

						return (
							<div
								key={item.featureId}
								className="flex items-start justify-between gap-3 rounded-md border bg-muted/20 p-3"
							>
								<div className="min-w-0 space-y-1">
									<div className="flex flex-wrap items-center gap-2">
										<p className="text-sm font-medium">{item.title}</p>
										<Badge
											variant="outline"
											className={AVAILABILITY_CLASS[state.availability]}
										>
											{AVAILABILITY_LABEL[state.availability]}
										</Badge>
									</div>
									<p className="text-xs text-muted-foreground">
										{item.description}
									</p>
									{state.reason && (
										<p className="text-xs text-muted-foreground">
											{state.reason}
										</p>
									)}
								</div>
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => openLaunchpadFeature(item.featureId)}
									disabled={isDisabled}
									className="shrink-0"
								>
									{actionLabel}
								</Button>
							</div>
						);
					})}
				</div>
			</div>

			<div className="space-y-6">
				{EXPERIMENTAL_FEATURE_CATEGORIES.map((category) => {
					const categoryFeatures = visibleFeatures.filter(
						(feature) => feature.category === category,
					);
					if (categoryFeatures.length === 0) return null;

					return (
						<section key={category} className="space-y-3">
							<div className="flex items-center justify-between gap-3 border-b pb-2">
								<h3 className="text-sm font-semibold">
									{EXPERIMENTAL_FEATURE_CATEGORY_LABELS[category]}
								</h3>
								<Badge variant="secondary">{categoryFeatures.length}</Badge>
							</div>
							<div className="divide-y rounded-md border">
								{categoryFeatures.map((feature) => {
									const state =
										statesById.get(feature.id) ?? getDefaultState(feature.id);
									const switchId = `experimental-feature-${feature.id.replaceAll(
										".",
										"-",
									)}`;

									return (
										<div
											key={feature.id}
											id={featureCardId(feature.id)}
											tabIndex={-1}
											className="grid gap-4 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start"
										>
											<div className="min-w-0 space-y-3">
												<div className="space-y-1">
													<div className="flex flex-wrap items-center gap-2">
														<Label
															htmlFor={switchId}
															className="text-sm font-medium"
														>
															{feature.title}
														</Label>
														<Badge variant="outline">
															{MATURITY_LABEL[feature.maturity]}
														</Badge>
														<Badge
															variant="outline"
															className={AVAILABILITY_CLASS[state.availability]}
														>
															{AVAILABILITY_LABEL[state.availability]}
														</Badge>
														{state.userOverride !== null && (
															<Badge variant="secondary">Custom</Badge>
														)}
													</div>
													<p className="text-xs text-muted-foreground">
														{feature.shortDescription}
													</p>
												</div>

												<div className="flex flex-wrap gap-1.5">
													{feature.affectedSurfaces.map((surface) => (
														<Badge key={surface} variant="outline">
															{surface}
														</Badge>
													))}
												</div>

												{feature.dependencies.length > 0 && (
													<p className="text-xs text-muted-foreground">
														Dependencies:{" "}
														{feature.dependencies
															.map((dependency) => dependency.label)
															.join(", ")}
													</p>
												)}

												{state.reason && (
													<p className="text-xs text-muted-foreground">
														{state.reason}
													</p>
												)}

												<details className="text-xs text-muted-foreground">
													<summary className="cursor-pointer text-foreground">
														Learn more
													</summary>
													<p className="mt-1">{feature.longDescription}</p>
												</details>
											</div>

											<Switch
												id={switchId}
												checked={state.enabled}
												onCheckedChange={(enabled) =>
													setOverride.mutate({ id: feature.id, enabled })
												}
												disabled={
													statesQuery.isLoading ||
													setOverride.isPending ||
													resetAll.isPending
												}
												aria-label={`Toggle ${feature.title}`}
												className="justify-self-start md:justify-self-end"
											/>
										</div>
									);
								})}
							</div>
						</section>
					);
				})}
			</div>
		</section>
	);
}
