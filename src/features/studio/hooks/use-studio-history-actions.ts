"use client";

import { useRouter } from "@tanstack/react-router";
import { readStudioApiError } from "@/features/studio/services/studio-frame-retry-client";
import { useUIStore } from "@/store";

async function postProjectAction(payload: unknown, fallback: string) {
	const response = await fetch("/api/studio/project", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	if (!response.ok)
		throw new Error(await readStudioApiError(response, fallback));
	return response;
}

/**
 * Project actions reachable from a history list. Every one of them writes
 * through the server action and then revalidates the loader, so the list, the
 * count badge and the filter all reconcile from persisted state rather than an
 * optimistic guess. None of them starts generation.
 */
export function useStudioHistoryActions() {
	const router = useRouter();
	const showToast = useUIStore((state) => state.showToast);

	return {
		deleteProject: async (id: string) => {
			await postProjectAction(
				{ action: "delete", projectId: id },
				"Gagal menghapus project. Coba lagi.",
			);
			await router.invalidate();
			showToast("Project dihapus.", "success");
		},
		renameProject: async (id: string, name: string) => {
			await postProjectAction(
				{ action: "rename", projectId: id, title: name },
				"Gagal mengganti nama project. Coba lagi.",
			);
			await router.invalidate();
		},
		// The copy lands in the list, so the list is revalidated instead of the
		// user being moved to a project they did not ask to open.
		duplicateProject: async (id: string) => {
			try {
				await postProjectAction(
					{ action: "duplicate", projectId: id },
					"Gagal menduplikasi project. Coba lagi.",
				);
				await router.invalidate();
				showToast("Project diduplikasi.", "success");
			} catch (failure) {
				showToast(
					failure instanceof Error
						? failure.message
						: "Gagal menduplikasi project. Coba lagi.",
					"error",
				);
			}
		},
	};
}
