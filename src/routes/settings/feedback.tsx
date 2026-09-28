import { createFileRoute, redirect } from "@tanstack/react-router";
import { FeedbackForm } from "@/components/settings/feedback-form";
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
		<div className="rounded-xl border border-(--border-subtle) bg-(--bg-card) p-6">
			<h2 className="mb-6 font-inter font-[510] text-xl font-bold">
				Feedback & Bug Report
			</h2>
			<p className="mb-6 text-sm text-(--text-secondary)">
				Bantu kami meningkatkan VibeEverything dengan memberikan feedback, melaporkan
				bug, atau meminta fitur baru.
			</p>
			<FeedbackForm />
		</div>
	);
}
