"use client";

import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useUIStore } from "@/store";
import {
	setErrorReportArchived,
	setFeedbackArchived,
	updateErrorReportStatus,
	updateFeedbackStatus,
} from "../services";
import type { FeedbackHandlingStatus } from "../types";

export interface UseAdminFeedbackMutationsOptions {
	onOptimisticFeedbackStatus?: (
		id: string,
		status: FeedbackHandlingStatus,
	) => void;
	onOptimisticFeedbackArchive?: (id: string, archived: boolean) => void;
	onOptimisticErrorStatus?: (
		id: string,
		status: FeedbackHandlingStatus,
	) => void;
	onOptimisticErrorArchive?: (id: string, archived: boolean) => void;
}

export function useAdminFeedbackMutations(
	options: UseAdminFeedbackMutationsOptions = {},
) {
	const router = useRouter();

	const showToast = useUIStore((s) => s.showToast);
	const [loadingActionId, setLoadingActionId] = useState<string | null>(null);

	const handleFeedbackStatusChange = async (
		id: string,
		status: FeedbackHandlingStatus,
	) => {
		setLoadingActionId(`status-${id}`);
		options.onOptimisticFeedbackStatus?.(id, status);
		try {
			await updateFeedbackStatus({ data: { id, status } });
			showToast("Status feedback berhasil diperbarui", "success");
			if (router) {
				await router.invalidate();
			}
		} catch (err) {
			console.error(err);
			showToast("Gagal memperbarui status feedback", "error");
		} finally {
			setLoadingActionId(null);
		}
	};

	const handleFeedbackArchiveChange = async (id: string, archived: boolean) => {
		setLoadingActionId(`archive-${id}`);
		options.onOptimisticFeedbackArchive?.(id, archived);
		try {
			await setFeedbackArchived({ data: { id, archived } });
			showToast(
				archived
					? "Feedback berhasil diarsipkan"
					: "Feedback dikembalikan dari arsip",
				"success",
			);
			if (router) {
				await router.invalidate();
			}
		} catch (err) {
			console.error(err);
			showToast("Gagal mengubah status arsip feedback", "error");
		} finally {
			setLoadingActionId(null);
		}
	};

	const handleErrorReportStatusChange = async (
		id: string,
		status: FeedbackHandlingStatus,
	) => {
		setLoadingActionId(`status-${id}`);
		options.onOptimisticErrorStatus?.(id, status);
		try {
			await updateErrorReportStatus({ data: { id, status } });
			showToast("Status laporan error berhasil diperbarui", "success");
			if (router) {
				await router.invalidate();
			}
		} catch (err) {
			console.error(err);
			showToast("Gagal memperbarui status laporan error", "error");
		} finally {
			setLoadingActionId(null);
		}
	};

	const handleErrorReportArchiveChange = async (
		id: string,
		archived: boolean,
	) => {
		setLoadingActionId(`archive-${id}`);
		options.onOptimisticErrorArchive?.(id, archived);
		try {
			await setErrorReportArchived({ data: { id, archived } });
			showToast(
				archived
					? "Laporan error berhasil diarsipkan"
					: "Laporan error dikembalikan dari arsip",
				"success",
			);
			if (router) {
				await router.invalidate();
			}
		} catch (err) {
			console.error(err);
			showToast("Gagal mengubah status arsip laporan error", "error");
		} finally {
			setLoadingActionId(null);
		}
	};

	return {
		loadingActionId,
		handleFeedbackStatusChange,
		handleFeedbackArchiveChange,
		handleErrorReportStatusChange,
		handleErrorReportArchiveChange,
	};
}
