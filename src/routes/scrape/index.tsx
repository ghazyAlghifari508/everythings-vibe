import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ScrapeWorkspaceView } from "@/features/scrape/components/scrape-workspace-view";
import {
	parseScrapeWorkspaceSearch,
	resolveScrapeWorkspaceMode,
} from "@/features/scrape/types/scrape-contract";
import {
	getRememberedScrapeMode,
	saveRememberedScrapeMode,
} from "@/features/scrape/utils/scrape-mode-session";

export const Route = createFileRoute("/scrape/")({
	head: () => ({
		meta: [
			{ title: "Scrape website | VibeScrape" },
			{
				name: "description",
				content:
					"Ekstrak HTML, token desain, dan aset gambar dari website publik.",
			},
		],
	}),
	validateSearch: (search) => parseScrapeWorkspaceSearch(search),
	beforeLoad: ({ search }) => {
		if (typeof window !== "undefined" && !search.mode) {
			const remembered = getRememberedScrapeMode();
			if (remembered) {
				throw redirect({
					to: "/scrape",
					search: { mode: remembered },
					replace: true,
				});
			}
		}
	},
	component: ScrapIndexPage,
});

function ScrapIndexPage() {
	const search = Route.useSearch();
	const navigate = useNavigate();
	const mode = resolveScrapeWorkspaceMode(search);

	useEffect(() => {
		if (search.mode) {
			saveRememberedScrapeMode(search.mode);
		} else {
			const remembered = getRememberedScrapeMode();
			if (remembered) {
				void navigate({
					to: "/scrape",
					search: { mode: remembered },
					replace: true,
				});
			}
		}
	}, [search.mode, navigate]);

	return <ScrapeWorkspaceView initialMode={mode} mode={mode} />;
}
