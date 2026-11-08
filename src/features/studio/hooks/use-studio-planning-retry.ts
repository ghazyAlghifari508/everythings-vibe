import { useCallback, useEffect, useRef, useState } from "react";

interface StudioPlanningRetryOptions {
	projectId: string;
	canRetryPlanning: boolean;
	syncProjectStatus: () => Promise<void>;
	setError: (message: string) => void;
}

export function useStudioPlanningRetry({
	projectId,
	canRetryPlanning,
	syncProjectStatus,
	setError,
}: StudioPlanningRetryOptions) {
	const [pendingProject, setPendingProject] = useState<string | null>(null);
	const pending = useRef<string | null>(null);
	const scope = useRef({ projectId, active: true });
	useEffect(() => {
		const current = { projectId, active: true };
		scope.current = current;
		pending.current = null;
		setPendingProject(null);
		return () => {
			current.active = false;
		};
	}, [projectId]);

	const handleRetryPlanning = useCallback(async () => {
		if (!canRetryPlanning || pending.current === projectId) return;
		const current = scope.current;
		pending.current = projectId;
		setPendingProject(projectId);
		setError("");
		try {
			const response = await fetch("/api/studio/frame", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ action: "retry-planning", projectId }),
			});
			if (!current.active) return;
			if (!response.ok) {
				const body: unknown = await response.json().catch(() => null);
				if (!current.active) return;
				const running =
					typeof body === "object" &&
					body !== null &&
					"code" in body &&
					body.code === "STUDIO_RETRY_RUNNING";
				if (!running)
					setError(
						"Permintaan ulang belum dapat diproses. Muat ulang status desain, lalu coba lagi.",
					);
			}
			await syncProjectStatus();
		} catch {
			if (current.active)
				setError("Koneksi terputus. Periksa koneksi lalu coba lagi.");
		} finally {
			if (current.active) {
				pending.current = null;
				setPendingProject(null);
			}
		}
	}, [canRetryPlanning, projectId, setError, syncProjectStatus]);

	return {
		handleRetryPlanning,
		retryingPlanning: pendingProject === projectId,
	};
}
