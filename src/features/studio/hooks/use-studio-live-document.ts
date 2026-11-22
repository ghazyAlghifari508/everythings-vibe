import { useEffect, useMemo, useReducer, useState } from "react";
import { z } from "zod";
import { readStudioApiError } from "../services/studio-frame-retry-client";
import {
	STUDIO_ELEMENT_TIMEOUT_MS,
	studioElementIdentitySchema,
} from "../types/studio-element";
import { STUDIO_LIVE_READY_TIMEOUT_MS } from "../types/studio-renderer";
import {
	emptyStudioLiveSlots,
	reduceStudioLiveSlots,
	studioLiveReadiness,
} from "../utils/studio-live-slots";
import { studioHtmlStamp, studioRendererKeyId } from "../utils/studio-renderer";

const liveDocumentSchema = z.object({
	html: z.string().max(2_000_000),
	baseHash: z.string().regex(/^[a-f0-9]{64}$/),
	elements: z.array(studioElementIdentitySchema),
	projectId: z.string(),
	frameId: z.string(),
	baseRevision: z.int(),
	channel: z.uuid(),
	unresolvedAssets: z.int().nonnegative(),
	unrenderedIcons: z.int().nonnegative(),
});
export type StudioLiveDocumentPayload = z.infer<typeof liveDocumentSchema>;

interface UseStudioLiveDocumentInput {
	projectId: string;
	frameId: string;
	revision: number;
	/** Persisted HTML; `null` is only valid for a stored revision snapshot. */
	html: string | null;
	enabled: boolean;
	revisionId?: string;
	side?: "before" | "after";
}

/**
 * Prepares the ephemeral live document for one persisted revision. The
 * viewport is not an input: a device change reuses the mounted document, so it
 * can never refetch, create a job or touch the design revision.
 */
export function useStudioLiveDocument({
	projectId,
	frameId,
	revision,
	html,
	enabled,
	revisionId,
	side,
}: UseStudioLiveDocumentInput) {
	const [state, dispatch] = useReducer(
		reduceStudioLiveSlots,
		emptyStudioLiveSlots,
	);
	const [attempt, setAttempt] = useState(0);
	const stamp = useMemo(() => studioHtmlStamp(html ?? ""), [html]);
	const hasSource = Boolean(html) || Boolean(revisionId);
	const keyId = studioRendererKeyId({
		projectId,
		frameId,
		revision,
		htmlStamp: stamp,
		attempt,
		revisionId,
		side,
	});
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyId encodes every fetch input
	useEffect(() => {
		if (!enabled) {
			dispatch({ type: "reset" });
			return;
		}
		if (!hasSource) {
			dispatch({
				type: "failed",
				failure: "html-unavailable",
				message: "HTML layar ini tidak tersimpan.",
			});
			return;
		}
		const controller = new AbortController();
		const channel = crypto.randomUUID();
		const params = new URLSearchParams({
			projectId,
			frameId,
			baseRevision: String(revision),
			channel,
			inspect: "1",
		});
		if (revisionId) params.set("revisionId", revisionId);
		if (side) params.set("side", side);
		void (async () => {
			try {
				const response = await fetch(`/api/studio/frame?${params}`, {
					signal: AbortSignal.any([
						controller.signal,
						AbortSignal.timeout(STUDIO_ELEMENT_TIMEOUT_MS),
					]),
				});
				if (!response.ok)
					throw new Error(
						await readStudioApiError(
							response,
							"Tampilan langsung belum dapat dimuat.",
						),
					);
				const parsed = liveDocumentSchema.parse(await response.json());
				if (
					parsed.channel !== channel ||
					parsed.projectId !== projectId ||
					parsed.frameId !== frameId ||
					parsed.baseRevision !== revision
				)
					throw new Error("Versi tampilan langsung tidak sesuai.");
				if (controller.signal.aborted) return;
				dispatch({
					type: "document",
					document: {
						keyId,
						html: parsed.html,
						channel,
						projectId,
						frameId,
						baseRevision: parsed.baseRevision,
						baseHash: parsed.baseHash,
						elements: parsed.elements,
						unresolvedAssets: parsed.unresolvedAssets,
						unrenderedIcons: parsed.unrenderedIcons,
					},
				});
			} catch (failure) {
				if (!controller.signal.aborted)
					dispatch({
						type: "failed",
						failure: "document-failed",
						message:
							failure instanceof Error && failure.message
								? failure.message
								: "Tampilan langsung belum dapat dimuat.",
					});
			}
		})();
		return () => controller.abort();
	}, [keyId, enabled, hasSource]);
	const incomingChannel = state.incoming?.channel;
	useEffect(() => {
		if (!incomingChannel) return;
		const timer = setTimeout(
			() =>
				dispatch({
					type: "timeout",
					channel: incomingChannel,
					message: "Tampilan langsung tidak merespons.",
				}),
			STUDIO_LIVE_READY_TIMEOUT_MS,
		);
		return () => clearTimeout(timer);
	}, [incomingChannel]);
	return {
		state,
		dispatch,
		readiness: studioLiveReadiness(state),
		retry: () => setAttempt((value) => value + 1),
	};
}
