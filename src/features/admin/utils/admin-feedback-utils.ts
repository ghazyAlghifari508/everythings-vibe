import type {
	AdminErrorReportItem,
	AdminErrorReportsListResult,
	AdminFeedbackItem,
	AdminFeedbackListResult,
	AdminFeedbackStats,
} from "../types";

export function computeFallbackFeedbackStats(
	feedback: AdminFeedbackItem[],
	errors: AdminErrorReportItem[],
): AdminFeedbackStats {
	const fbActive = feedback.filter((f) => !f.archivedAt).length;
	const fbArchived = feedback.filter((f) => Boolean(f.archivedAt)).length;
	const errActive = errors.filter((e) => !e.archivedAt).length;
	const errArchived = errors.filter((e) => Boolean(e.archivedAt)).length;

	return {
		totalItems: feedback.length + errors.length,
		generalCount: feedback.filter(
			(f) => f.type === "general" || f.type === null || f.type === undefined,
		).length,
		featureCount: feedback.filter((f) => f.type === "feature").length,
		bugCount: errors.length + feedback.filter((f) => f.type === "bug").length,
		feedbackTotal: feedback.length,
		errorTotal: errors.length,
		activeTotal: fbActive + errActive,
		archivedTotal: fbArchived + errArchived,
		feedbackActiveTotal: fbActive,
		feedbackArchivedTotal: fbArchived,
		errorActiveTotal: errActive,
		errorArchivedTotal: errArchived,
	};
}

export interface ResolveFeedbackDisplayArgs {
	currentTab: "feedback" | "errors";
	feedbackResult?: AdminFeedbackListResult;
	errorsResult?: AdminErrorReportsListResult;
	fallbackFeedback: AdminFeedbackItem[];
	fallbackErrors: AdminErrorReportItem[];
	search: string;
	activeType: string;
	activeStatus?: string;
	activeArchiveFilter?: string;
	clientPage: number;
	clientPageSize: number;
}

export interface ResolvedFeedbackDisplay {
	displayedFeedback: AdminFeedbackItem[];
	displayedErrors: AdminErrorReportItem[];
	currentPage: number;
	currentPageSize: number;
	currentTotalCount: number;
	currentTotalPages: number;
}

export function resolveFeedbackDisplay(
	args: ResolveFeedbackDisplayArgs,
): ResolvedFeedbackDisplay {
	const {
		currentTab,
		feedbackResult,
		errorsResult,
		fallbackFeedback,
		fallbackErrors,
		search,
		activeType,
		activeStatus,
		activeArchiveFilter = "active",
		clientPage,
		clientPageSize,
	} = args;

	if (currentTab === "feedback") {
		if (feedbackResult) {
			return {
				displayedFeedback: feedbackResult.feedback,
				displayedErrors: [],
				currentPage: feedbackResult.page,
				currentPageSize: feedbackResult.pageSize,
				currentTotalCount: feedbackResult.totalCount,
				currentTotalPages: feedbackResult.totalPages,
			};
		}

		const filtered = fallbackFeedback.filter((f) => {
			const matchesSearch =
				!search ||
				f.message.toLowerCase().includes(search.toLowerCase()) ||
				f.userEmail?.toLowerCase().includes(search.toLowerCase()) ||
				f.userName?.toLowerCase().includes(search.toLowerCase());
			const matchesType = activeType === "all" || f.type === activeType;
			const status = f.handlingStatus ?? "new";
			const matchesStatus =
				!activeStatus || activeStatus === "all" || status === activeStatus;
			const isArchived = Boolean(f.archivedAt);
			const matchesArchive =
				activeArchiveFilter === "all"
					? true
					: activeArchiveFilter === "archived"
						? isArchived
						: !isArchived;
			return matchesSearch && matchesType && matchesStatus && matchesArchive;
		});

		const currentTotalCount = filtered.length;
		const currentPageSize = clientPageSize;
		const currentTotalPages = Math.max(
			1,
			Math.ceil(currentTotalCount / currentPageSize),
		);
		const currentPage = Math.min(clientPage, currentTotalPages);
		const offset = (currentPage - 1) * currentPageSize;
		const displayedFeedback = filtered.slice(offset, offset + currentPageSize);

		return {
			displayedFeedback,
			displayedErrors: [],
			currentPage,
			currentPageSize,
			currentTotalCount,
			currentTotalPages,
		};
	}

	if (errorsResult) {
		return {
			displayedFeedback: [],
			displayedErrors: errorsResult.errors,
			currentPage: errorsResult.page,
			currentPageSize: errorsResult.pageSize,
			currentTotalCount: errorsResult.totalCount,
			currentTotalPages: errorsResult.totalPages,
		};
	}

	const filtered = fallbackErrors.filter((e) => {
		const matchesSearch =
			!search ||
			e.errorMessage.toLowerCase().includes(search.toLowerCase()) ||
			e.context?.toLowerCase().includes(search.toLowerCase()) ||
			e.userEmail?.toLowerCase().includes(search.toLowerCase()) ||
			e.userName?.toLowerCase().includes(search.toLowerCase());
		const status = e.handlingStatus ?? "new";
		const matchesStatus =
			!activeStatus || activeStatus === "all" || status === activeStatus;
		const isArchived = Boolean(e.archivedAt);
		const matchesArchive =
			activeArchiveFilter === "all"
				? true
				: activeArchiveFilter === "archived"
					? isArchived
					: !isArchived;
		return matchesSearch && matchesStatus && matchesArchive;
	});

	const currentTotalCount = filtered.length;
	const currentPageSize = clientPageSize;
	const currentTotalPages = Math.max(
		1,
		Math.ceil(currentTotalCount / currentPageSize),
	);
	const currentPage = Math.min(clientPage, currentTotalPages);
	const offset = (currentPage - 1) * currentPageSize;
	const displayedErrors = filtered.slice(offset, offset + currentPageSize);

	return {
		displayedFeedback: [],
		displayedErrors,
		currentPage,
		currentPageSize,
		currentTotalCount,
		currentTotalPages,
	};
}
