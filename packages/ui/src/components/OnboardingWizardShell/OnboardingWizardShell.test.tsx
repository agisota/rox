import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { OnboardingWizardShell } from "./OnboardingWizardShell";
import { ProbeStatusIndicator } from "./ProbeStatusIndicator";

/**
 * Render contract for the onboarding wizard shell (F48 / #637). Web + desktop
 * share this DOM shell, so it must render the header, the step body slot, and
 * footer affordances strictly from props (the neutral nav core decides which
 * are present), and the probe badge must reflect the shared status.
 */
describe("OnboardingWizardShell", () => {
	it("renders the header, body slot and step dots", () => {
		const html = renderToStaticMarkup(
			<OnboardingWizardShell
				currentStep={0}
				totalSteps={4}
				title="Запуск Rox"
				subtitle="Подключите агентов."
			>
				<div data-slot="step-body">body</div>
			</OnboardingWizardShell>,
		);
		expect(html).toContain('data-slot="onboarding-wizard-shell"');
		expect(html).toContain("Запуск Rox");
		expect(html).toContain("Подключите агентов.");
		expect(html).toContain('data-slot="step-body"');
	});

	it("hides Back/Continue/Skip when their handlers are null", () => {
		const html = renderToStaticMarkup(
			<OnboardingWizardShell
				currentStep={1}
				totalSteps={4}
				title="Шаг"
				onBack={null}
				onContinue={null}
				onSkip={null}
			>
				body
			</OnboardingWizardShell>,
		);
		expect(html).not.toContain("Назад");
		expect(html).not.toContain("Продолжить");
		expect(html).not.toContain("Пропустить пока");
	});

	it("shows Back/Continue/Skip with localized labels when handlers exist", () => {
		const html = renderToStaticMarkup(
			<OnboardingWizardShell
				currentStep={1}
				totalSteps={4}
				title="Шаг"
				onBack={() => {}}
				onContinue={() => {}}
				onSkip={() => {}}
			>
				body
			</OnboardingWizardShell>,
		);
		expect(html).toContain("Назад");
		expect(html).toContain("Продолжить");
		expect(html).toContain("Пропустить пока");
	});
});

describe("ProbeStatusIndicator", () => {
	it("reflects the shared probe status via a data attribute", () => {
		expect(
			renderToStaticMarkup(<ProbeStatusIndicator status="idle" />),
		).toContain('data-status="idle"');
		expect(
			renderToStaticMarkup(<ProbeStatusIndicator status="ok" />),
		).toContain('data-status="ok"');
	});

	it("surfaces the failure reason on error", () => {
		const html = renderToStaticMarkup(
			<ProbeStatusIndicator status="error" error="401 Unauthorized" />,
		);
		expect(html).toContain('data-slot="probe-error"');
		expect(html).toContain("401 Unauthorized");
	});
});
