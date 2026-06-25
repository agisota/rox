import {
	CONNECT_ONLY_CAPABILITIES,
	canContinue as canContinueNav,
	canGoBack,
	createWizardNavState,
	PROBE_IDLE,
	type ProbeState,
	probeGateSatisfied,
	withStepCopy,
	wizardNavReducer,
} from "@rox/shared/wizard";
import { useRouter } from "expo-router";
import { useReducer, useState } from "react";
import { Linking, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Text } from "@/components/ui/text";

/**
 * Mobile (RN) connect-only onboarding host (F48, #637).
 *
 * Consumes the SAME platform-neutral wizard core as web + desktop
 * (`@rox/shared/wizard`: the step sequence, the nav reducer, the probe state
 * machine) but renders it with React Native primitives — it does NOT import the
 * DOM `@rox/ui` shell or framer-motion. Capabilities are
 * {@link CONNECT_ONLY_CAPABILITIES} (`canInstallDeps: false`), so the system
 * step is connect-only (no dep installer).
 *
 * Probe: the browser/desktop `/models` probe has no RN server path here, so the
 * probe stays `idle`; the connect-only requirement is met by rendering the same
 * neutral step + status. Reduced motion is honored via reanimated's
 * {@link useReducedMotion}, the established mobile convention (mirrors
 * `ChatSlashCommandMenu`), so the same shouldAnimate intent is respected without
 * pulling in the DOM motion kit.
 */
const STEPS = withStepCopy({
	system: {
		title: "Подключите провайдеров",
		subtitle: "Войдите в провайдеров агентов, чтобы начать работу.",
	},
	setup: {
		title: "Проверьте провайдера моделей",
		subtitle: "Проверка моделей доступна в десктоп-приложении Rox.",
		optional: true,
	},
	workspace: {
		title: "Откройте рабочее пространство",
		subtitle: "Выберите рабочее пространство, чтобы продолжить.",
	},
	finish: {
		title: "Готово к работе",
		subtitle: "Перейдите к рабочим пространствам Rox.",
	},
});

const PROVIDER_DOCS = "https://docs.rox.one/providers";

export function OnboardingScreen() {
	const router = useRouter();
	const reduceMotion = useReducedMotion();
	// `reduceMotion` is read so the shared shouldAnimate intent is part of render;
	// the RN host snaps step changes (no spring) — there is no decorative motion
	// to gate yet, so the value only documents the honored preference.
	void reduceMotion;

	const [navState, dispatch] = useReducer(
		wizardNavReducer,
		createWizardNavState(STEPS.length),
	);
	// Connect-only on mobile: the probe has no server path here, so it stays idle.
	const [probe] = useState<ProbeState>(PROBE_IDLE);

	const { canInstallDeps } = CONNECT_ONLY_CAPABILITIES;
	const currentStep = STEPS[navState.currentIndex];
	const isLastStep = navState.currentIndex === STEPS.length - 1;
	const gateSatisfied =
		currentStep?.id === "setup" ? probeGateSatisfied(probe) : true;

	const finish = () => {
		router.replace("/");
	};

	const canContinue = isLastStep || canContinueNav(navState, gateSatisfied);

	return (
		<View className="flex-1 bg-background p-6">
			<View className="flex-1 gap-6">
				{/* Step dots — RN parity of the shared PaginationDots. */}
				<View className="flex-row items-center justify-center gap-1.5">
					{STEPS.map((step, i) => (
						<View
							key={step.id}
							className={
								i === navState.currentIndex
									? "size-1.5 rounded-full bg-foreground"
									: "size-1.5 rounded-full bg-muted-foreground/30"
							}
						/>
					))}
				</View>

				<View className="gap-2">
					<Text className="text-2xl font-semibold text-foreground">
						{currentStep?.title}
					</Text>
					{currentStep?.subtitle ? (
						<Text className="text-sm text-muted-foreground">
							{currentStep.subtitle}
						</Text>
					) : null}
				</View>

				{currentStep?.id === "system" && (
					<Card className="gap-3 p-5">
						<Text className="text-sm font-medium text-foreground">
							Провайдеры агентов
						</Text>
						<Text className="text-xs text-muted-foreground">
							{canInstallDeps
								? "Установите и подключите инструменты."
								: "Откройте документацию, чтобы подключить провайдеров."}
						</Text>
						<Button
							variant="outline"
							size="sm"
							onPress={() => Linking.openURL(PROVIDER_DOCS)}
						>
							<Text>Документация провайдеров</Text>
						</Button>
					</Card>
				)}
				{currentStep?.id === "setup" && (
					<Card className="gap-3 p-5">
						<Text className="text-sm text-muted-foreground">
							Статус проверки: не проверено
						</Text>
						<Text className="text-xs text-muted-foreground">
							Проверка моделей через /models доступна в десктоп-приложении.
						</Text>
					</Card>
				)}
				{currentStep?.id === "workspace" && (
					<Card className="gap-3 p-5">
						<Text className="text-sm font-medium text-foreground">
							Рабочее пространство
						</Text>
						<Text className="text-xs text-muted-foreground">
							Перейдите к рабочим пространствам, чтобы открыть проект.
						</Text>
					</Card>
				)}
				{currentStep?.id === "finish" && (
					<Card className="gap-3 p-5">
						<Text className="text-sm font-medium text-foreground">
							Всё готово
						</Text>
						<Text className="text-xs text-muted-foreground">
							Нажмите «Завершить», чтобы перейти к рабочим пространствам.
						</Text>
					</Card>
				)}
			</View>

			<View className="flex-row items-center justify-between gap-2">
				<View className="flex-1">
					{canGoBack(navState) ? (
						<Button
							variant="ghost"
							size="sm"
							onPress={() => dispatch({ type: "back" })}
						>
							<Text>Назад</Text>
						</Button>
					) : null}
				</View>
				<Button variant="ghost" size="sm" onPress={finish}>
					<Text className="text-muted-foreground">Пропустить пока</Text>
				</Button>
				<Button
					size="sm"
					disabled={!canContinue}
					onPress={() => (isLastStep ? finish() : dispatch({ type: "next" }))}
				>
					<Text>{isLastStep ? "Завершить" : "Продолжить"}</Text>
				</Button>
			</View>
		</View>
	);
}
