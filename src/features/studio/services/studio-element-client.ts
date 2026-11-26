import { z } from "zod";
import {
	STUDIO_ELEMENT_TIMEOUT_MS,
	type StudioElementRequest,
	studioElementPreviewSchema,
} from "../types/studio-element";
import { readStudioApiError } from "./studio-frame-retry-client";

const mutationResponse = z.object({
	revision: studioElementPreviewSchema.nullable(),
});

type ElementMutation =
	| { action: "element-prepare"; request: StudioElementRequest }
	| {
			action: "element-transition";
			projectId: string;
			revisionId: string;
			transition: "apply" | "cancel" | "undo";
	  };

export async function mutateStudioElement(
	mutation: ElementMutation,
	onRejected?: () => void,
) {
	const response = await fetch("/api/studio/frame", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(mutation),
		signal: AbortSignal.timeout(STUDIO_ELEMENT_TIMEOUT_MS),
	});
	if (!response.ok) {
		onRejected?.();
		throw new Error(
			await readStudioApiError(
				response,
				"Revisi belum berhasil. Pilih ulang elemen jika versi berubah.",
			),
		);
	}
	return mutationResponse.parse(await response.json()).revision;
}
