import type { fetchAsset } from "./fetch-html";
import { resolveOpenversePhoto } from "./openverse-photos";
import { resolvePexelsPhoto } from "./pexels-photos";
import type { PhotoRequest, PhotoResult } from "./photo-asset";

/**
 * Provider order. Pexels is preferred when a credential is configured because
 * its library is curated for design use and needs no attribution; otherwise
 * Openverse answers keyless, and the credit line then carries the licence and
 * the Openverse notice its terms require.
 */
export function createStudioPhotoSource(
	options: {
		pexelsKey?: string;
		load?: typeof fetchAsset;
		deadlineMs?: number;
	} = {},
) {
	const pexels = resolvePexelsPhoto(
		options.pexelsKey,
		options.load,
		options.deadlineMs,
	);
	const openverse = resolveOpenversePhoto(options.load, options.deadlineMs);
	const noAsset: PhotoResult[] = [
		"not-configured",
		"no-match",
		"invalid-image",
	];
	/**
	 * One request per slot. A provider that timed out, ran out of budget or was
	 * busy is not retried against the next one: a slow answer must fail honestly
	 * instead of spending the frame budget twice.
	 */
	return async (request: PhotoRequest): Promise<PhotoResult> => {
		const preferred = await pexels(request);
		if (typeof preferred !== "string" || !noAsset.includes(preferred))
			return preferred;
		const fallback = await openverse(request);
		return fallback === "not-configured" ? preferred : fallback;
	};
}

export const resolveStudioPhoto = createStudioPhotoSource({
	pexelsKey: process.env.STUDIO_PEXELS_API_KEY?.trim(),
});
