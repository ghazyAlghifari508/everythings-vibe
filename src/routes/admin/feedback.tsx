import { createFileRoute } from "@tanstack/react-router";
import {
	AdminFeedbackView,
	listErrorReports,
	listFeedback,
} from "@/features/admin";

export const Route = createFileRoute("/admin/feedback")({
	staleTime: 30_000,
	loader: async () => {
		const [feedback, errors] = await Promise.all([
			listFeedback({ data: {} }),
			listErrorReports(),
		]);
		return { feedback, errors };
	},
	component: AdminFeedbackPage,
});

function AdminFeedbackPage() {
	const { feedback, errors } = Route.useLoaderData();
	return <AdminFeedbackView feedback={feedback} errors={errors} />;
}
