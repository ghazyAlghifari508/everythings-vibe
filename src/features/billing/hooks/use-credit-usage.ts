"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CreditOperationStage } from "@/db/schema";
import type { CreditOperationState } from "@/features/billing/services/adaptive-credit";
import type {
	CreditOperationKind,
	CreditOperationProduct,
} from "@/features/billing/services/credit-operation-registry";
import { loadCreditUsageHistory } from "@/features/billing/services/credit-usage.functions";
import type {
	CreditOperationItem,
	CreditUsagePagination,
	PaginatedCreditUsageResult,
} from "@/features/billing/types/credit-usage";

export type StageFilter = "all" | CreditOperationStage;
export type StatusFilter = "all" | CreditOperationState;
export type ProductFilter = "all" | CreditOperationProduct;
export type KindFilter = "all" | CreditOperationKind;
export type CreditUsageFetchParams = {
	page: number;
	pageSize: number;
	stage: StageFilter;
	status: StatusFilter;
	product: ProductFilter;
	kind: KindFilter;
};

export interface UseCreditUsageOptions {
	operations?: CreditOperationItem[];
	initialPagination?: CreditUsagePagination;
	onFetch?: (
		params: CreditUsageFetchParams,
	) => Promise<PaginatedCreditUsageResult>;
}

export function useCreditUsage({
	operations: initialOperations = [],
	initialPagination,
	onFetch,
}: UseCreditUsageOptions) {
	const [stageFilter, setStageFilter] = useState<StageFilter>("all");
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [productFilter, setProductFilter] = useState<ProductFilter>("all");
	const [kindFilter, setKindFilter] = useState<KindFilter>("all");
	const [page, setPage] = useState<number>(initialPagination?.page ?? 1);
	const pageSize = initialPagination?.pageSize ?? 10;

	const isServerMode = Boolean(initialPagination || onFetch);

	const [serverData, setServerData] =
		useState<PaginatedCreditUsageResult | null>(
			initialPagination
				? {
						items: initialOperations,
						total: initialPagination.total,
						page: initialPagination.page,
						pageSize: initialPagination.pageSize,
						totalPages: initialPagination.totalPages,
					}
				: null,
		);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const isInitialMount = useRef(true);

	const executeFetch = useCallback(
		async (
			targetPage: number,
			stage: StageFilter,
			status: StatusFilter,
			product: ProductFilter,
			kind: KindFilter,
		) => {
			setLoading(true);
			setError(null);
			try {
				const fetcher =
					onFetch ??
					(async (params: CreditUsageFetchParams) => {
						return await loadCreditUsageHistory({
							data: {
								page: params.page,
								pageSize: params.pageSize,
								stage: params.stage === "all" ? undefined : params.stage,
								status: params.status === "all" ? undefined : params.status,
								product: params.product === "all" ? undefined : params.product,
								kind: params.kind === "all" ? undefined : params.kind,
							},
						});
					});

				const result = await fetcher({
					page: targetPage,
					pageSize,
					stage,
					status,
					product,
					kind,
				});
				setServerData(result);
			} catch {
				setError("Gagal memuat riwayat penggunaan kredit. Silakan coba lagi.");
			} finally {
				setLoading(false);
			}
		},
		[onFetch, pageSize],
	);

	useEffect(() => {
		if (!isServerMode) return;

		if (isInitialMount.current) {
			isInitialMount.current = false;
			return;
		}

		void executeFetch(
			page,
			stageFilter,
			statusFilter,
			productFilter,
			kindFilter,
		);
	}, [
		isServerMode,
		page,
		stageFilter,
		statusFilter,
		productFilter,
		kindFilter,
		executeFetch,
	]);

	// In local fallback mode:
	const localFiltered = useMemo(() => {
		if (isServerMode) return [];
		return initialOperations.filter((op) => {
			if (stageFilter !== "all" && op.stage !== stageFilter) return false;
			if (statusFilter !== "all" && op.state !== statusFilter) return false;
			if (productFilter !== "all" && op.product !== productFilter) return false;
			if (kindFilter !== "all" && op.kind !== kindFilter) return false;
			return true;
		});
	}, [
		isServerMode,
		initialOperations,
		stageFilter,
		statusFilter,
		productFilter,
		kindFilter,
	]);

	const localTotal = localFiltered.length;
	const localTotalPages = Math.max(1, Math.ceil(localTotal / pageSize));
	const localPaged = useMemo(() => {
		if (isServerMode) return [];
		const start = (page - 1) * pageSize;
		return localFiltered.slice(start, start + pageSize);
	}, [isServerMode, localFiltered, page, pageSize]);

	const items = isServerMode ? (serverData?.items ?? []) : localPaged;
	const total = isServerMode ? (serverData?.total ?? 0) : localTotal;
	const totalPages = isServerMode
		? (serverData?.totalPages ?? 1)
		: localTotalPages;
	const currentPage = page;

	const handleStageChange = (newStage: StageFilter) => {
		setStageFilter(newStage);
		setPage(1);
	};

	const handleStatusChange = (newStatus: StatusFilter) => {
		setStatusFilter(newStatus);
		setPage(1);
	};

	const handleProductChange = (newProduct: ProductFilter) => {
		setProductFilter(newProduct);
		setPage(1);
	};

	const handleKindChange = (newKind: KindFilter) => {
		setKindFilter(newKind);
		setPage(1);
	};

	const handleResetFilter = () => {
		setStageFilter("all");
		setStatusFilter("all");
		setProductFilter("all");
		setKindFilter("all");
		setPage(1);
	};

	const handleRetry = () => {
		void executeFetch(
			page,
			stageFilter,
			statusFilter,
			productFilter,
			kindFilter,
		);
	};

	const handlePageChange = (newPage: number) => {
		setPage(newPage);
	};

	const hasActiveFilter =
		stageFilter !== "all" ||
		statusFilter !== "all" ||
		productFilter !== "all" ||
		kindFilter !== "all";

	return {
		stageFilter,
		statusFilter,
		productFilter,
		kindFilter,
		page,
		pageSize,
		currentPage,
		totalPages,
		total,
		items,
		loading,
		error,
		hasActiveFilter,
		handleStageChange,
		handleStatusChange,
		handleResetFilter,
		handleProductChange,
		handleKindChange,
		handleRetry,
		handlePageChange,
		setPage,
	};
}
