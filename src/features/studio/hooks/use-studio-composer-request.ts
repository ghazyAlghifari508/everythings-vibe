import { useCallback, useRef, useState } from "react";
import { z } from "zod";
import type { StudioComposerSubmitResult } from "../components/composer/studio-composer";
import {
	readStudioChatStorage,
	writeStudioChatStorage,
} from "../services/studio-chat-storage";
import { readStudioApiError } from "../services/studio-frame-retry-client";

const requestSchema = z.object({ signature: z.string(), id: z.uuid() });
const outcomeSchema = z.object({
	intent: z.enum([
		"add_screen",
		"revise_selected",
		"revise_project",
		"clarify",
	]),
	message: z.string().optional(),
});

export function useStudioComposerRequest({
	projectId,
	userId,
	selectedFrameIds,
	setError,
	syncProjectStatus,
}: {
	projectId: string;
	userId: string;
	selectedFrameIds: string[];
	setError: (message: string) => void;
	syncProjectStatus: () => Promise<void>;
}) {
	const [composerLoading, setComposerLoading] = useState(false);
	const sending = useRef(false);
	const pending = useRef<z.infer<typeof requestSchema> | null>(null);
	const handleComposerSubmit = useCallback(
		async (prompt: string): Promise<StudioComposerSubmitResult> => {
			if (sending.current) return { accepted: false };
			sending.current = true;
			setComposerLoading(true);
			setError("");
			const key = `studio-chat-request:${userId}:${projectId}`;
			const signature = JSON.stringify({
				projectId,
				prompt,
				frameIds: [...selectedFrameIds].sort(),
			});
			try {
				if (pending.current?.signature !== signature) {
					let stored: unknown = null;
					try {
						stored = JSON.parse(readStudioChatStorage(key) ?? "null");
					} catch {
						stored = null;
					}
					const parsed = requestSchema.safeParse(stored);
					pending.current =
						parsed.success && parsed.data.signature === signature
							? parsed.data
							: { signature, id: crypto.randomUUID() };
				}
				writeStudioChatStorage(key, JSON.stringify(pending.current));
				const res = await fetch("/api/studio/frame", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: "operation",
						projectId,
						prompt,
						frameIds: selectedFrameIds,
						requestId: pending.current.id,
					}),
				});
				if (!res.ok) {
					setError(await readStudioApiError(res, "Permintaan desain ditolak."));
					return { accepted: false };
				}
				const outcome = outcomeSchema.parse(await res.json());
				pending.current = null;
				writeStudioChatStorage(key, null);
				await syncProjectStatus();
				return outcome.intent === "clarify"
					? { accepted: false, clarify: outcome.message }
					: { accepted: true };
			} catch {
				setError(
					"Permintaan belum dapat dikonfirmasi. Draft tetap tersimpan; kirim ulang untuk memeriksa permintaan yang sama.",
				);
				return { accepted: false };
			} finally {
				sending.current = false;
				setComposerLoading(false);
			}
		},
		[projectId, userId, selectedFrameIds, setError, syncProjectStatus],
	);
	return { composerLoading, handleComposerSubmit };
}
