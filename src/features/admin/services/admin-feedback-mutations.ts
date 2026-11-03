import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import type { FeedbackHandlingStatus } from "../types";
import { adminDb } from "./admin-db";

export const updateFeedbackStatus = createServerFn({ method: "POST" })
	.validator((data: { id: string; status: FeedbackHandlingStatus }) => {
		const id = typeof data?.id === "string" ? data.id.trim() : "";
		if (!id) {
			throw new Error("ID feedback diperlukan");
		}
		const status = data?.status;
		if (status !== "new" && status !== "in_progress" && status !== "resolved") {
			throw new Error("Status feedback tidak valid");
		}
		return { id, status };
	})
	.handler(async ({ data }) => {
		await requireAdmin(await getRequestHeaders());
		const { db, feedback } = await adminDb();
		const [updated] = await db
			.update(feedback)
			.set({ handlingStatus: data.status })
			.where(eq(feedback.id, data.id))
			.returning({
				id: feedback.id,
				handlingStatus: feedback.handlingStatus,
				archivedAt: feedback.archivedAt,
			});
		if (!updated) {
			throw new Error("Feedback tidak ditemukan");
		}
		return { success: true, item: updated };
	});

export const setFeedbackArchived = createServerFn({ method: "POST" })
	.validator((data: { id: string; archived: boolean }) => {
		const id = typeof data?.id === "string" ? data.id.trim() : "";
		if (!id) {
			throw new Error("ID feedback diperlukan");
		}
		if (typeof data?.archived !== "boolean") {
			throw new Error("Status arsip harus berupa boolean");
		}
		return { id, archived: data.archived };
	})
	.handler(async ({ data }) => {
		await requireAdmin(await getRequestHeaders());
		const { db, feedback } = await adminDb();
		const [updated] = await db
			.update(feedback)
			.set({ archivedAt: data.archived ? new Date() : null })
			.where(eq(feedback.id, data.id))
			.returning({
				id: feedback.id,
				handlingStatus: feedback.handlingStatus,
				archivedAt: feedback.archivedAt,
			});
		if (!updated) {
			throw new Error("Feedback tidak ditemukan");
		}
		return { success: true, item: updated };
	});

export const updateErrorReportStatus = createServerFn({ method: "POST" })
	.validator((data: { id: string; status: FeedbackHandlingStatus }) => {
		const id = typeof data?.id === "string" ? data.id.trim() : "";
		if (!id) {
			throw new Error("ID laporan error diperlukan");
		}
		const status = data?.status;
		if (status !== "new" && status !== "in_progress" && status !== "resolved") {
			throw new Error("Status error tidak valid");
		}
		return { id, status };
	})
	.handler(async ({ data }) => {
		await requireAdmin(await getRequestHeaders());
		const { db, errorReports } = await adminDb();
		const [updated] = await db
			.update(errorReports)
			.set({ handlingStatus: data.status })
			.where(eq(errorReports.id, data.id))
			.returning({
				id: errorReports.id,
				handlingStatus: errorReports.handlingStatus,
				archivedAt: errorReports.archivedAt,
			});
		if (!updated) {
			throw new Error("Laporan error tidak ditemukan");
		}
		return { success: true, item: updated };
	});

export const setErrorReportArchived = createServerFn({ method: "POST" })
	.validator((data: { id: string; archived: boolean }) => {
		const id = typeof data?.id === "string" ? data.id.trim() : "";
		if (!id) {
			throw new Error("ID laporan error diperlukan");
		}
		if (typeof data?.archived !== "boolean") {
			throw new Error("Status arsip harus berupa boolean");
		}
		return { id, archived: data.archived };
	})
	.handler(async ({ data }) => {
		await requireAdmin(await getRequestHeaders());
		const { db, errorReports } = await adminDb();
		const [updated] = await db
			.update(errorReports)
			.set({ archivedAt: data.archived ? new Date() : null })
			.where(eq(errorReports.id, data.id))
			.returning({
				id: errorReports.id,
				handlingStatus: errorReports.handlingStatus,
				archivedAt: errorReports.archivedAt,
			});
		if (!updated) {
			throw new Error("Laporan error tidak ditemukan");
		}
		return { success: true, item: updated };
	});
