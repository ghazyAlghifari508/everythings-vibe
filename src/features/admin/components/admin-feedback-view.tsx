"use client";

import {
	ArrowLeft01Icon,
	BubbleChatIcon,
	Bug02Icon,
	InboxIcon,
	SparklesIcon,
} from "@hugeicons/core-free-icons";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type {
	AdminErrorReportItem,
	AdminErrorReportsListResult,
	AdminFeedbackItem,
	AdminFeedbackListResult,
	AdminFeedbackSearchParams,
	AdminFeedbackStats,
} from "../types";
import {
	computeFallbackFeedbackStats,
	resolveFeedbackDisplay,
} from "../utils/admin-feedback-utils";
import { AdminErrorReportTable } from "./admin-error-report-table";
import { AdminFeedbackFilterBar } from "./admin-feedback-filter-bar";
import { AdminFeedbackTable } from "./admin-feedback-table";
import { AdminMetricCard } from "./admin-metric-card";

export interface AdminFeedbackViewProps {
	feedbackResult?: AdminFeedbackListResult;
	errorsResult?: AdminErrorReportsListResult;
	feedback?: AdminFeedbackItem[];
	errors?: AdminErrorReportItem[];
	stats?: AdminFeedbackStats;
	currentUserId?: string;
	searchParams?: Partial<AdminFeedbackSearchParams>;
}

export function AdminFeedbackView({
	feedbackResult,
	errorsResult,
	feedback: fallbackFeedback,
	errors: fallbackErrors,
	stats,
	searchParams,
}: AdminFeedbackViewProps) {
	const navigate = useNavigate();

	const activeTab = searchParams?.tab ?? "feedback";
	const [clientTab, setClientTab] = useState<"feedback" | "errors">("feedback");
	const currentTab = searchParams ? activeTab : clientTab;

	const initialSearch = searchParams?.search ?? "";
	const [search, setSearch] = useState(initialSearch);
	const [clientPage, setClientPage] = useState(1);
	const [clientPageSize, setClientPageSize] = useState(20);
	const [clientTypeFilter, setClientTypeFilter] = useState<string>("all");

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
						feedbackPage: searchParams.page ?? 1,
						feedbackPageSize: searchParams.pageSize ?? 20,
						feedbackSearch: searchParams.search ?? "",
						feedbackType: searchParams.type ?? "all",
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
						errorPage: searchParams.page ?? 1,
						errorPageSize: searchParams.pageSize ?? 20,
						errorSearch: searchParams.search ?? "",
					},
				});
			}
		} else {
			setClientTab(newTab);
			setSearch("");
			setClientPage(1);
			setClientTypeFilter("all");
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

	const allFeedback = feedbackResult?.feedback ?? fallbackFeedback ?? [];
	const allErrors = errorsResult?.errors ?? fallbackErrors ?? [];
	const computedStats: AdminFeedbackStats =
		stats ?? computeFallbackFeedbackStats(allFeedback, allErrors);

	const activeType = searchParams?.type ?? clientTypeFilter;

	const {
		displayedFeedback,
		displayedErrors,
		currentPage,
		currentPageSize,
		currentTotalCount,
		currentTotalPages,
	} = resolveFeedbackDisplay({
		currentTab,
		feedbackResult,
		errorsResult,
		fallbackFeedback: allFeedback,
		fallbackErrors: allErrors,
		search,
		activeType,
		clientPage,
		clientPageSize,
	});

	const hasFeedbackFilter = Boolean(search || activeType !== "all");
	const hasErrorFilter = Boolean(search);

	return (
		<div className="mx-auto max-w-7xl space-y-8 font-inter">
			{/* Quick Workspace Back Link */}
			<div className="flex items-center">
				<Link
					to="/"
					className="inline-flex items-center gap-1.5 text-xs font-[510] text-fog transition-colors hover:text-snow"
				>
					<Icon icon={ArrowLeft01Icon} size={14} />
					<span>Kembali ke Workspace</span>
				</Link>
			</div>

			{/* Header */}
			<header className="border-b border-graphite pb-6">
				<h1 className="text-2xl font-[510] text-snow">
					Feedback & Laporan Error
				</h1>
				<p className="mt-1 text-sm text-fog">
					Daftar masukan pengguna, permintaan fitur, dan catatan crash sistem.
				</p>
			</header>

			{/* Metric Summary Bar */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<AdminMetricCard
					label="Total Masukan"
					value={computedStats.totalItems}
					subtext="Feedback & log error"
					icon={InboxIcon}
				/>
				<AdminMetricCard
					label="Feedback Umum"
					value={computedStats.generalCount}
					subtext="Masukan & saran pengguna"
					icon={BubbleChatIcon}
				/>
				<AdminMetricCard
					label="Permintaan Fitur"
					value={computedStats.featureCount}
					subtext="Ide & wishlist pengguna"
					icon={SparklesIcon}
				/>
				<AdminMetricCard
					label="Bug & Crash"
					value={computedStats.bugCount}
					subtext="Tiket bug & error sistem"
					icon={Bug02Icon}
				/>
			</div>

			{/* Filters and Tabs Bar */}
			<AdminFeedbackFilterBar
				currentTab={currentTab}
				onTabChange={handleTabChange}
				activeType={activeType}
				onTypeChange={handleTypeFilterChange}
				search={search}
				onSearchChange={setSearch}
				feedbackTotal={computedStats.feedbackTotal}
				errorTotal={computedStats.errorTotal}
			/>

			{/* Main Content List & Tables */}
			{currentTab === "feedback" ? (
				<AdminFeedbackTable
					feedback={displayedFeedback}
					totalCount={currentTotalCount}
					page={currentPage}
					pageSize={currentPageSize}
					totalPages={currentTotalPages}
					hasFilter={hasFeedbackFilter}
					onPageChange={handlePageChange}
					onPageSizeChange={handlePageSizeChange}
				/>
			) : (
				<AdminErrorReportTable
					errors={displayedErrors}
					totalCount={currentTotalCount}
					page={currentPage}
					pageSize={currentPageSize}
					totalPages={currentTotalPages}
					hasFilter={hasErrorFilter}
					onPageChange={handlePageChange}
					onPageSizeChange={handlePageSizeChange}
				/>
			)}
		</div>
	);
}
