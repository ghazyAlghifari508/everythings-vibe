import { useCallback, useEffect, useState } from "react";
import { z } from "zod";
import {
	type StudioPrototypeDocument,
	studioPrototypeDocumentSchema,
} from "../types/studio-prototype";
import { STUDIO_LIVE_READY_TIMEOUT_MS } from "../types/studio-renderer";

export type StudioPrototypeDocumentStatus =
	| { phase: "loading" }
	| { phase: "loaded" }
	| { phase: "ready" }
	| { phase: "failed"; message: string; missing: boolean };

interface Input {
	projectId: string;
	frameId: string | null;
	/** Bumped by Refresh; refetches the latest committed HTML. */
	refresh: number;
}

const errorSchema = z.object({
	error: z.string(),
	code: z.string().optional(),
});

/**
 * Loads the isolated prototype document for one frame. A read only: it never
 * enqueues a job, spends credit or writes a revision. The previous document
 * stays mounted while the next one loads, so navigating between pages never
 * flashes an empty stage.
 */
export function useStudioPrototypeDocument({
	projectId,
	frameId,
	refresh,
}: Input) {
	const [document, setDocument] = useState<StudioPrototypeDocument | null>(
		null,
	);
	const [status, setStatus] = useState<StudioPrototypeDocumentStatus>({
		phase: "loading",
	});
	const [attempt, setAttempt] = useState(0);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refresh and attempt are explicit refetch triggers
	useEffect(() => {
		if (!frameId) {
			setDocument(null);
			setStatus({ phase: "loading" });
			return;
		}
		const controller = new AbortController();
		const channel = crypto.randomUUID();
		setStatus({ phase: "loading" });
		const params = new URLSearchParams({
			prototype: "1",
			projectId,
			frameId,
			channel,
		});
		void (async () => {
			try {
				const response = await fetch(`/api/studio/frame?${params}`, {
					signal: AbortSignal.any([
						controller.signal,
						AbortSignal.timeout(30_000),
					]),
				});
				if (!response.ok) {
					const body = errorSchema.safeParse(
						await response.json().catch(() => null),
					);
					setStatus({
						phase: "failed",
						message: body.success
							? body.data.error
							: "Prototipe belum dapat dimuat.",
						missing: response.status === 404,
					});
					return;
				}
				const parsed = studioPrototypeDocumentSchema.parse(
					await response.json(),
				);
				if (
					parsed.channel !== channel ||
					parsed.projectId !== projectId ||
					parsed.frameId !== frameId
				)
					throw new Error("Dokumen prototipe tidak sesuai.");
				if (controller.signal.aborted) return;
				setDocument(parsed);
				setStatus({ phase: "loaded" });
			} catch {
				if (controller.signal.aborted) return;
				setStatus({
					phase: "failed",
					message: "Prototipe belum dapat dimuat.",
					missing: false,
				});
			}
		})();
		return () => controller.abort();
	}, [projectId, frameId, refresh, attempt]);

	const documentChannel = document?.channel;
	const loaded = status.phase === "loaded";
	useEffect(() => {
		if (!loaded || !documentChannel) return;
		const timer = setTimeout(
			() =>
				setStatus((current) =>
					current.phase === "loaded"
						? {
								phase: "failed",
								message: "Prototipe tidak merespons.",
								missing: false,
							}
						: current,
				),
			STUDIO_LIVE_READY_TIMEOUT_MS,
		);
		return () => clearTimeout(timer);
	}, [loaded, documentChannel]);

	const markReady = useCallback(() => {
		setStatus((current) =>
			current.phase === "loaded" ? { phase: "ready" } : current,
		);
	}, []);

	return {
		document,
		status,
		markReady,
		retry: () => setAttempt((value) => value + 1),
	};
}
