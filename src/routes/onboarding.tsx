import { createFileRoute } from "@tanstack/react-router";
import { Logo } from "@/components/ui/logo";
import { OnboardingForm } from "@/features/auth-settings/components/auth/onboarding-form";

export const Route = createFileRoute("/onboarding")({
	component: OnboardingPage,
});

function OnboardingPage() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center px-4">
			<div className="mb-8">
				<Logo height={40} />
			</div>
			<OnboardingForm />
		</div>
	);
}
