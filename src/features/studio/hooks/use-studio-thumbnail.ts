import { useEffect, useState } from "react";
import { z } from "zod";

const thumbnailSchema = z.object({
	html: z.string().max(2_000_000),
	projectId: z.string(),
	frameId: z.string(),
	revision: z.int().nonnegative(),
});
export type StudioThumbnailDocument = z.infer<typeof thumbnailSchema>;

export type StudioThumbnailState =
	| { status: "loading" }
	| { status: "ready"; document: StudioThumbnailDocument }
	| { status: "unavailable" };

const MAX_PARALLEL = 3;
const MAX_CACHED = 24;
const cache = new Map<string, StudioThumbnailDocument>();
const inflight = new Map<string, Promise<StudioThumbnailDocument | null>>();
const waiting: (() => void)[] = [];
let running = 0;

async function slot<T>(task: () => Promise<T>): Promise<T> {
	if (running >= MAX_PARALLEL)
		await new Promise<void>((resolve) => waiting.push(resolve));
	running += 1;
	try {
		return await task();
	} finally {
		running -= 1;
		waiting.shift()?.();
	}
}

/** Test seam: forgets every fetched thumbnail document. */
export function resetStudioThumbnailCache() {
	cache.clear();
	inflight.clear();
}

async function load(
	projectId: string,
	frameId: string,
	revision: number,
): Promise<StudioThumbnailDocument | null> {
	const key = `${projectId}:${frameId}:${revision}`;
	const hit = cache.get(key);
	if (hit) return hit;
	const pending = inflight.get(key);
	if (pending) return pending;
	const request = slot(async () => {
		try {
			const response = await fetch(
				`/api/studio/frame?${new URLSearchParams({ thumbnail: "1", projectId, frameId })}`,
				{ signal: AbortSignal.timeout(20_000) },
			);
			if (!response.ok) return null;
			const parsed = thumbnailSchema.safeParse(await response.json());
			// A document for another project, frame or newer revision is not this row's picture.
			if (
				!parsed.success ||
				parsed.data.projectId !== projectId ||
				parsed.data.frameId !== frameId ||
				parsed.data.revision < revision
			)
				return null;
			cache.set(key, parsed.data);
			const oldest = cache.keys().next();
			if (cache.size > MAX_CACHED && !oldest.done) cache.delete(oldest.value);
			return parsed.data;
		} catch {
			return null;
		} finally {
			inflight.delete(key);
		}
	});
	inflight.set(key, request);
	return request;
}

/**
 * Presentation-only preview of a frame's committed HTML. It never creates a
 * job, revision, credit charge or model call, and it is never what makes a frame
 * "ready": failure leaves the row showing honest metadata instead.
 */
export function useStudioThumbnail(input: {
	projectId: string;
	frameId: string | null;
	revision: number;
	enabled: boolean;
}): StudioThumbnailState {
	const { projectId, frameId, revision, enabled } = input;
	const [state, setState] = useState<StudioThumbnailState>({
		status: enabled && frameId ? "loading" : "unavailable",
	});
	useEffect(() => {
		if (!enabled || !frameId) {
			setState({ status: "unavailable" });
			return;
		}
		let current = true;
		setState({ status: "loading" });
		void load(projectId, frameId, revision).then((document) => {
			if (current)
				setState(
					document ? { status: "ready", document } : { status: "unavailable" },
				);
		});
		return () => {
			current = false;
		};
	}, [projectId, frameId, revision, enabled]);
	return state;
}
