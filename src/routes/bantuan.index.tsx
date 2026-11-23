import { createFileRoute } from "@tanstack/react-router";
import { HelpHome } from "@/features/help/components/help-home";

export const Route = createFileRoute("/bantuan/")({
	component: HelpHome,
});
