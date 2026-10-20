import { createFileRoute, redirect } from "@tanstack/react-router";
import { FeedbackForm } from "@/features/auth-settings/components/settings/feedback-form";
import { SettingsContentPanel } from "@/features/auth-settings/components/settings/settings-content-panel";
import { requireUserServer } from "@/lib/session";

export const Route = createFileRoute("/settings/feedback")({
	beforeLoad: async () => {
		try {
			await requireUserServer();
		} catch {
			throw redirect({ to: "/login" });
		}
	},
	component: FeedbackPage,
});

function FeedbackPage() {
	return (
		<SettingsContentPanel
			title="Feedback & Bug Report"
			description="Bantu kami meningkatkan everythings-vibe dengan memberikan feedback, melaporkan bug, atau meminta fitur baru."
		>
			<FeedbackForm />
		</SettingsContentPanel>
	);
}
