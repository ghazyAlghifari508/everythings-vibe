"use client";

import {
	ArrowLeft01Icon,
	BubbleChatIcon,
	Bug02Icon,
	InboxIcon,
	SparklesIcon,
} from "@hugeicons/core-free-icons";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useAdminFeedbackFilters } from "../hooks/use-admin-feedback-filters";
import { useAdminFeedbackMutations } from "../hooks/use-admin-feedback-mutations";
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
	const {
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
	} = useAdminFeedbackFilters({ searchParams });

	const [localFeedback, setLocalFeedback] = useState<AdminFeedbackItem[]>(
		feedbackResult?.feedback ?? fallbackFeedback ?? [],
	);
	const [localErrors, setLocalErrors] = useState<AdminErrorReportItem[]>(
		errorsResult?.errors ?? fallbackErrors ?? [],
	);

	useEffect(() => {
		if (feedbackResult?.feedback) {
			setLocalFeedback(feedbackResult.feedback);
		} else if (fallbackFeedback) {
			setLocalFeedback(fallbackFeedback);
		}
	}, [feedbackResult?.feedback, fallbackFeedback]);

	useEffect(() => {
		if (errorsResult?.errors) {
			setLocalErrors(errorsResult.errors);
		} else if (fallbackErrors) {
			setLocalErrors(fallbackErrors);
		}
	}, [errorsResult?.errors, fallbackErrors]);

	const {
		loadingActionId,
		handleFeedbackStatusChange,
		handleFeedbackArchiveChange,
		handleErrorReportStatusChange,
		handleErrorReportArchiveChange,
	} = useAdminFeedbackMutations({
		onOptimisticFeedbackStatus: (id, newStatus) => {
			setLocalFeedback((prev) =>
				prev.map((f) =>
					f.id === id ? { ...f, handlingStatus: newStatus } : f,
				),
			);
		},
		onOptimisticFeedbackArchive: (id, archived) => {
			setLocalFeedback((prev) =>
				prev.map((f) =>
					f.id === id ? { ...f, archivedAt: archived ? new Date() : null } : f,
				),
			);
		},
		onOptimisticErrorStatus: (id, newStatus) => {
			setLocalErrors((prev) =>
				prev.map((e) =>
					e.id === id ? { ...e, handlingStatus: newStatus } : e,
				),
			);
		},
		onOptimisticErrorArchive: (id, archived) => {
			setLocalErrors((prev) =>
				prev.map((e) =>
					e.id === id ? { ...e, archivedAt: archived ? new Date() : null } : e,
				),
			);
		},
	});

	const allFeedback = localFeedback;
	const allErrors = localErrors;
	const computedStats: AdminFeedbackStats =
		stats ?? computeFallbackFeedbackStats(allFeedback, allErrors);

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
		activeStatus,
		activeArchiveFilter,
		clientPage,
		clientPageSize,
	});

	const hasFeedbackFilter = Boolean(
		search ||
			activeType !== "all" ||
			activeStatus !== "all" ||
			activeArchiveFilter !== "active",
	);
	const hasErrorFilter = Boolean(
		search || activeStatus !== "all" || activeArchiveFilter !== "active",
	);

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
				activeStatus={activeStatus}
				onStatusChange={handleStatusChange}
				activeArchiveFilter={activeArchiveFilter}
				onArchiveFilterChange={handleArchiveFilterChange}
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
					isMutating={loadingActionId !== null}
					onStatusChange={handleFeedbackStatusChange}
					onArchiveChange={handleFeedbackArchiveChange}
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
					isMutating={loadingActionId !== null}
					onStatusChange={handleErrorReportStatusChange}
					onArchiveChange={handleErrorReportArchiveChange}
					onPageChange={handlePageChange}
					onPageSizeChange={handlePageSizeChange}
				/>
			)}
		</div>
	);
}
