"use client";

import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type {
	AdminFeedbackSearchParams,
	FeedbackArchiveFilter,
	FeedbackHandlingStatus,
} from "../types";

export interface UseAdminFeedbackFiltersProps {
	searchParams?: Partial<AdminFeedbackSearchParams>;
}

export function useAdminFeedbackFilters({
	searchParams,
}: UseAdminFeedbackFiltersProps = {}) {
	const navigate = useNavigate();

	const activeTab = searchParams?.tab ?? "feedback";
	const [clientTab, setClientTab] = useState<"feedback" | "errors">("feedback");
	const currentTab = searchParams ? activeTab : clientTab;

	const initialSearch = searchParams?.search ?? "";
	const [search, setSearch] = useState(initialSearch);
	const [clientPage, setClientPage] = useState(1);
	const [clientPageSize, setClientPageSize] = useState(20);
	const [clientTypeFilter, setClientTypeFilter] = useState<string>("all");
	const [clientStatusFilter, setClientStatusFilter] = useState<string>("all");
	const [clientArchiveFilter, setClientArchiveFilter] =
		useState<string>("active");

	// Synchronize local search input if search param changes from navigation or tab switch
	useEffect(() => {
		const targetSearch = searchParams?.search ?? "";
		if (targetSearch !== search) {
			setSearch(targetSearch);
		}
	}, [searchParams?.search, search]);

	// Debounce search update (300ms) to trigger server query
	const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	useEffect(() => {
		if (!navigate || !searchParams) return;
		const trimmed = search.trim();
		if (trimmed === (searchParams.search ?? "")) return;

		clearTimeout(searchTimeoutRef.current ?? undefined);

		searchTimeoutRef.current = setTimeout(() => {
			if (currentTab === "feedback") {
				void navigate({
					to: "/admin/feedback",
					search: {
						...searchParams,
						tab: "feedback",
						page: 1,
						search: trimmed,
						feedbackPage: 1,
						feedbackSearch: trimmed,
					},
				});
			} else {
				void navigate({
					to: "/admin/feedback",
					search: {
						...searchParams,
						tab: "errors",
						page: 1,
						search: trimmed,
						errorPage: 1,
						errorSearch: trimmed,
					},
				});
			}
		}, 300);

		return () => {
			clearTimeout(searchTimeoutRef.current ?? undefined);
		};
	}, [search, searchParams, currentTab, navigate]);

	const handleTabChange = (newTab: "feedback" | "errors") => {
		if (newTab === currentTab) return;

		if (navigate && searchParams) {
			if (newTab === "errors") {
				void navigate({
					to: "/admin/feedback",
					search: {
						...searchParams,
						tab: "errors",
						page: searchParams.errorPage ?? 1,
						pageSize: searchParams.errorPageSize ?? 20,
						search: searchParams.errorSearch ?? "",
						type: "all",
						status: searchParams.errorStatus ?? "all",
						archiveFilter: searchParams.errorArchiveFilter ?? "active",
						feedbackPage: searchParams.page ?? 1,
						feedbackPageSize: searchParams.pageSize ?? 20,
						feedbackSearch: searchParams.search ?? "",
						feedbackType: searchParams.type ?? "all",
						feedbackStatus: searchParams.status ?? "all",
						feedbackArchiveFilter: searchParams.archiveFilter ?? "active",
					},
				});
			} else {
				void navigate({
					to: "/admin/feedback",
					search: {
						...searchParams,
						tab: "feedback",
						page: searchParams.feedbackPage ?? 1,
						pageSize: searchParams.feedbackPageSize ?? 20,
						search: searchParams.feedbackSearch ?? "",
						type: searchParams.feedbackType ?? "all",
						status: searchParams.feedbackStatus ?? "all",
						archiveFilter: searchParams.feedbackArchiveFilter ?? "active",
						errorPage: searchParams.page ?? 1,
						errorPageSize: searchParams.pageSize ?? 20,
						errorSearch: searchParams.search ?? "",
						errorStatus: searchParams.status ?? "all",
						errorArchiveFilter: searchParams.archiveFilter ?? "active",
					},
				});
			}
		} else {
			setClientTab(newTab);
			setSearch("");
			setClientPage(1);
			setClientTypeFilter("all");
			setClientStatusFilter("all");
			setClientArchiveFilter("active");
		}
	};

	const handleTypeFilterChange = (newType: string) => {
		if (navigate && searchParams) {
			void navigate({
				to: "/admin/feedback",
				search: {
					...searchParams,
					tab: "feedback",
					page: 1,
					type: newType as "all" | "bug" | "feature" | "general",
					feedbackPage: 1,
					feedbackType: newType as "all" | "bug" | "feature" | "general",
				},
			});
		} else {
			setClientTypeFilter(newType);
			setClientPage(1);
		}
	};

	const activeType = searchParams?.type ?? clientTypeFilter;
	const activeStatus = searchParams?.status ?? clientStatusFilter;
	const activeArchiveFilter =
		searchParams?.archiveFilter ?? clientArchiveFilter;

	const handleStatusChange = (newStatus: string) => {
		if (navigate && searchParams) {
			void navigate({
				to: "/admin/feedback",
				search: {
					...searchParams,
					page: 1,
					status: newStatus as FeedbackHandlingStatus | "all",
					...(currentTab === "feedback"
						? {
								feedbackPage: 1,
								feedbackStatus: newStatus as FeedbackHandlingStatus | "all",
							}
						: {
								errorPage: 1,
								errorStatus: newStatus as FeedbackHandlingStatus | "all",
							}),
				},
			});
		} else {
			setClientStatusFilter(newStatus);
			setClientPage(1);
		}
	};

	const handleArchiveFilterChange = (newFilter: string) => {
		if (navigate && searchParams) {
			void navigate({
				to: "/admin/feedback",
				search: {
					...searchParams,
					page: 1,
					archiveFilter: newFilter as FeedbackArchiveFilter,
					...(currentTab === "feedback"
						? {
								feedbackPage: 1,
								feedbackArchiveFilter: newFilter as FeedbackArchiveFilter,
							}
						: {
								errorPage: 1,
								errorArchiveFilter: newFilter as FeedbackArchiveFilter,
							}),
				},
			});
		} else {
			setClientArchiveFilter(newFilter);
			setClientPage(1);
		}
	};

	const handlePageChange = (newPage: number) => {
		if (navigate && searchParams) {
			if (currentTab === "feedback") {
				void navigate({
					to: "/admin/feedback",
					search: {
						...searchParams,
						page: newPage,
						feedbackPage: newPage,
					},
				});
			} else {
				void navigate({
					to: "/admin/feedback",
					search: {
						...searchParams,
						page: newPage,
						errorPage: newPage,
					},
				});
			}
		} else {
			setClientPage(newPage);
		}
	};

	const handlePageSizeChange = (newPageSize: number) => {
		if (navigate && searchParams) {
			if (currentTab === "feedback") {
				void navigate({
					to: "/admin/feedback",
					search: {
						...searchParams,
						page: 1,
						pageSize: newPageSize,
						feedbackPage: 1,
						feedbackPageSize: newPageSize,
					},
				});
			} else {
				void navigate({
					to: "/admin/feedback",
					search: {
						...searchParams,
						page: 1,
						pageSize: newPageSize,
						errorPage: 1,
						errorPageSize: newPageSize,
					},
				});
			}
		} else {
			setClientPageSize(newPageSize);
			setClientPage(1);
		}
	};

	return {
		currentTab,
		handleTabChange,
		search,
		setSearch,
		activeType,
		handleTypeFilterChange,
		activeStatus,
		handleStatusChange,
		activeArchiveFilter,
		handleArchiveFilterChange,
		clientPage,
		clientPageSize,
		handlePageChange,
		handlePageSizeChange,
	};
}
