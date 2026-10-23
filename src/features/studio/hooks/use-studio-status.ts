import { useCallback, useEffect, useRef, useState } from "react";
import {
	STUDIO_STATUS_BACKOFF_MAX_MS,
	STUDIO_STATUS_MAX_FAILURES,
	STUDIO_STATUS_POLL_MS,
	STUDIO_STATUS_REQUEST_TIMEOUT_MS,
} from "../types/studio-constants";
import {
	isStudioProcessing,
	type StudioStatus,
	studioStatusSchema,
} from "../types/studio-status";

function retainRow<T extends { updatedAt: Date }>(previous: T, next: T): T {
	return previous.updatedAt > next.updatedAt ||
		JSON.stringify(previous) === JSON.stringify(next)
		? previous
		: next;
}

function reconcile(previous: StudioStatus, next: StudioStatus): StudioStatus {
	const byId = new Map(previous.frames.map((frame) => [frame.id, frame]));
	const frames = next.frames.map((frame) => {
		const stored = byId.get(frame.id);
		return stored ? retainRow(stored, frame) : frame;
	});
	const stableFrames =
		frames.length === previous.frames.length &&
		frames.every((frame, index) => frame === previous.frames[index]);
	const project = retainRow(previous.project, next.project);
	const previousJob = previous.activeJob;
	const nextJob = next.activeJob;
	const activeJob =
		previousJob && nextJob
			? previousJob.id === nextJob.id
				? retainRow(previousJob, nextJob)
				: previousJob.createdAt > nextJob.createdAt
					? previousJob
					: nextJob
			: nextJob;
	if (
		stableFrames &&
		project === previous.project &&
		activeJob === previous.activeJob
	)
		return previous;
	return {
		project,
		activeJob,
		frames: stableFrames ? previous.frames : frames,
	};
}

class StatusFailure extends Error {
	constructor(
		message: string,
		readonly permanent = false,
	) {
		super(message);
	}
}

export function useStudioStatus(initialData: StudioStatus) {
	const [status, setStatus] = useState<StudioStatus>(initialData);
	const [error, setError] = useState("");
	const refresh = useRef<() => Promise<void>>(async () => {});
	const syncProjectStatus = useCallback(() => refresh.current(), []);
	const clearError = useCallback(() => setError(""), []);

	useEffect(() => {
		let disposed = false;
		let sequence = 0;
		let failures = 0;
		let permanent = false;
		let current = initialData;
		let controller: AbortController | undefined;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let requestTimer: ReturnType<typeof setTimeout> | undefined;
		let rejectRequest: ((reason: Error) => void) | undefined;
		setStatus(initialData);
		setError("");

		const available = () =>
			document.visibilityState !== "hidden" && navigator.onLine !== false;
		const cancel = () => {
			sequence++;
			clearTimeout(timer);
			clearTimeout(requestTimer);
			controller?.abort();
			rejectRequest?.(new DOMException("Request cancelled", "AbortError"));
			rejectRequest = undefined;
		};
		const schedule = (delay: number) => {
			if (
				!disposed &&
				!permanent &&
				failures < STUDIO_STATUS_MAX_FAILURES &&
				available() &&
				(isStudioProcessing(current) || failures > 0)
			)
				timer = setTimeout(() => {
					void request();
				}, delay);
		};
		const request = async () => {
			cancel();
			if (disposed || !available()) return;
			const token = sequence;
			const abort = new AbortController();
			controller = abort;
			try {
				const data = await Promise.race([
					(async () => {
						const response = await fetch(
							`/api/studio/project?id=${encodeURIComponent(initialData.project.id)}`,
							{
								signal: abort.signal,
								cache: "no-store",
							},
						);
						if (!response.ok) {
							const unauthorized =
								response.status === 401 || response.status === 403;
							throw new StatusFailure(
								unauthorized
									? "Sesi berakhir. Masuk kembali untuk memuat desain."
									: response.status === 404
										? "Project tidak ditemukan atau sudah dihapus."
										: "Status desain belum dapat dimuat. Sinkronisasi akan dicoba lagi.",
								response.status >= 400 &&
									response.status < 500 &&
									response.status !== 408 &&
									response.status !== 429,
							);
						}
						const payload: unknown = await response.json();
						const parsed = studioStatusSchema.safeParse(payload);
						if (
							!parsed.success ||
							parsed.data.project.id !== initialData.project.id
						)
							throw new StatusFailure(
								"Status desain belum dapat dibaca. Muat ulang halaman untuk mencoba lagi.",
								true,
							);
						return parsed.data;
					})(),
					new Promise<never>((_, reject) => {
						rejectRequest = reject;
						requestTimer = setTimeout(() => {
							abort.abort();
							reject(
								new StatusFailure(
									"Koneksi terputus. Sinkronisasi desain akan dicoba lagi.",
								),
							);
						}, STUDIO_STATUS_REQUEST_TIMEOUT_MS);
					}),
				]);
				if (disposed || token !== sequence) return;
				current = reconcile(current, data);
				setStatus(current);
				setError("");
				failures = 0;
			} catch (failure) {
				if (disposed || token !== sequence) return;
				failures++;
				permanent = failure instanceof StatusFailure && failure.permanent;
				setError(
					failures >= STUDIO_STATUS_MAX_FAILURES
						? "Sinkronisasi desain terhenti. Periksa koneksi, lalu muat ulang halaman untuk mencoba lagi."
						: failure instanceof StatusFailure
							? failure.message
							: "Koneksi terputus. Sinkronisasi desain akan dicoba lagi.",
				);
			} finally {
				if (!disposed && token === sequence) {
					clearTimeout(requestTimer);
					rejectRequest = undefined;
					controller = undefined;
					schedule(
						Math.min(
							STUDIO_STATUS_POLL_MS * 2 ** failures,
							STUDIO_STATUS_BACKOFF_MAX_MS,
						),
					);
				}
			}
		};
		const manualRefresh = async () => {
			failures = 0;
			permanent = false;
			await request();
		};
		refresh.current = manualRefresh;
		const resume = () => {
			if (!available()) cancel();
			else if (!permanent) void manualRefresh();
		};
		document.addEventListener("visibilitychange", resume);
		window.addEventListener("online", resume);
		window.addEventListener("offline", resume);
		schedule(STUDIO_STATUS_POLL_MS);
		return () => {
			disposed = true;
			cancel();
			refresh.current = async () => {};
			document.removeEventListener("visibilitychange", resume);
			window.removeEventListener("online", resume);
			window.removeEventListener("offline", resume);
		};
	}, [initialData]);

	return {
		...status,
		error,
		syncProjectStatus,
		isProcessing: isStudioProcessing(status),
		clearError,
	};
}
