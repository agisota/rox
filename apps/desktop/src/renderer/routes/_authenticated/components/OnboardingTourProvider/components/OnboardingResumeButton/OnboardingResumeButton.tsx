import { Button } from "@rox/ui/button";

interface OnboardingResumeButtonProps {
	percent: number;
	onResume: () => void;
}

export function OnboardingResumeButton({
	percent,
	onResume,
}: OnboardingResumeButtonProps) {
	return (
		<Button className="fixed bottom-4 left-4 z-50 shadow-lg" onClick={onResume}>
			Продолжить onboarding · {percent}%
		</Button>
	);
}
