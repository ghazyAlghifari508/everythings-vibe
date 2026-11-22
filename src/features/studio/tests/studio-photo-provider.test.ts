import { expect, it, vi } from "vitest";
import type { FetchedAsset, fetchAsset } from "@/lib/fetch-html";
import { resolveOpenversePhoto } from "@/lib/openverse-photos";
import { resolvePexelsPhoto } from "@/lib/pexels-photos";
import { createStudioPhotoSource } from "@/lib/studio-photo-source";

/** Real JPEG geometry: SOF0 800×1200, so dimension checks read bytes, not metadata. */
const jpeg = Buffer.from(
	"ffd8ffc0001108032004b003011100021101031101ffd9",
	"hex",
);

function response(body: Buffer, contentType = "image/jpeg"): FetchedAsset {
	return {
		body,
		status: 200,
		contentType,
		finalUrl: "https://studio.invalid/",
	};
}
const pexelsPhoto = {
	id: 25,
	width: 1200,
	height: 800,
	url: "https://www.pexels.com/photo/lake-25/",
	photographer: "Ada",
	alt: "Lake Batur at dawn",
	src: { large: "https://images.pexels.com/photos/25/photo.jpeg" },
};
const openversePhoto = {
	title: "Lake Batur at dawn",
	url: "https://live.staticflickr.com/7203/6859140105_5eb32202d9_b.jpg",
	width: 1024,
	height: 680,
	creator: "prilfish",
	license: "by",
	license_version: "2.0",
	license_url: "https://creativecommons.org/licenses/by/2.0/",
	foreign_landing_url: "https://www.flickr.com/photos/37707866@N00/2569693257",
};
const need = { query: "Lake Batur", aspect: "landscape" as const };
const openverseNeed = { query: "lake batur", aspect: "landscape" as const };

function pexelsTransport(photo = pexelsPhoto, mime = "image/jpeg") {
	return vi.fn<typeof fetchAsset>(async (raw) =>
		raw.includes("api.pexels.com")
			? response(
					Buffer.from(JSON.stringify({ photos: [photo] })),
					"application/json",
				)
			: response(jpeg, mime),
	);
}

function openverseTransport(photo = openversePhoto, imageMime = "image/jpeg") {
	return vi.fn<typeof fetchAsset>(async (raw) =>
		raw.includes("api.openverse.org")
			? response(
					Buffer.from(JSON.stringify({ results: [photo] })),
					"application/json",
				)
			: response(jpeg, imageMime),
	);
}

it("resolves and deduplicates an approved, credited raster photo", async () => {
	const load = pexelsTransport();
	const resolve = resolvePexelsPhoto("test-key", load);
	const [first, second] = await Promise.all([resolve(need), resolve(need)]);
	expect(first).toEqual({
		url: pexelsPhoto.src.large,
		width: 1200,
		height: 800,
		creator: "Ada",
		source: pexelsPhoto.url,
		alt: pexelsPhoto.alt,
		provider: "Pexels",
	});
	expect(second).toEqual(first);
	// One search for two concurrent screens; the credential never follows a redirect.
	expect(load.mock.calls[0]?.[2]?.authorization).toBe("test-key");
	expect(
		load.mock.calls.filter(([raw]) => raw.includes("api.pexels.com")),
	).toHaveLength(1);
});

it("never fetches off-provider results and rejects unsupported responses", async () => {
	const unsafe = pexelsTransport({
		...pexelsPhoto,
		src: { large: "https://localhost/photo.jpeg" },
	});
	expect(await resolvePexelsPhoto("test", unsafe)(need)).toBe("no-match");
	expect(
		unsafe.mock.calls.filter(([raw]) => raw.includes("localhost")),
	).toHaveLength(0);
	expect(
		await resolvePexelsPhoto(
			"test",
			pexelsTransport(pexelsPhoto, "image/svg+xml"),
		)(need),
	).toBe("invalid-image");
});

it("times out without blocking an independent unrelated frame", async () => {
	const load = vi.fn<typeof fetchAsset>((raw, _, options) => {
		if (raw.includes("mountain"))
			return Promise.withResolvers<FetchedAsset>().promise;
		return pexelsTransport()(raw, 0, options);
	});
	const resolve = resolvePexelsPhoto("test", load, 80);
	const delayed = resolve({ ...need, query: "Mountain" });
	expect(await resolve(need)).toMatchObject({ url: pexelsPhoto.src.large });
	expect(await delayed).toBe("timeout");
});

it("resolves a permissively licensed photo without any credential", async () => {
	const load = openverseTransport();
	const asset = await resolveOpenversePhoto(load)(openverseNeed);
	expect(asset).toEqual({
		url: openversePhoto.url,
		width: 1200,
		height: 800,
		creator: "prilfish",
		source: openversePhoto.foreign_landing_url,
		alt: openversePhoto.title,
		provider: "Openverse",
		license: {
			name: "CC BY 2.0",
			url: "https://creativecommons.org/licenses/by/2.0/",
		},
	});
	const search = new URL(String(load.mock.calls[0]?.[0]));
	expect(search.searchParams.get("license")).toBe("cc0,pdm,by");
	expect(search.searchParams.get("mature")).toBe("false");
	// Openverse publishes no orientation filter; aspect is enforced from bytes.
	expect(search.searchParams.has("orientation")).toBe(false);
	expect(load.mock.calls[0]?.[2]?.authorization).toBeUndefined();
});

it("rejects a candidate whose verified geometry breaks the requested aspect", async () => {
	// 800x1200 portrait bytes for a landscape slot, and vice versa.
	const portraitJpeg = Buffer.from(
		"ffd8ffc000110804b0032003011100021101031101ffd9",
		"hex",
	);
	const load = vi.fn<typeof fetchAsset>(async (raw) =>
		raw.includes("api.openverse.org")
			? response(
					Buffer.from(JSON.stringify({ results: [openversePhoto] })),
					"application/json",
				)
			: response(portraitJpeg),
	);
	expect(await resolveOpenversePhoto(load)(openverseNeed)).toBe(
		"invalid-image",
	);
});

it("rejects an Openverse result whose title misses the subject or whose bytes are not a photo", async () => {
	const offBrief = openverseTransport({
		...openversePhoto,
		title: "Mountain road",
	});
	expect(await resolveOpenversePhoto(offBrief)(openverseNeed)).toBe("no-match");
	const svg = openverseTransport(openversePhoto, "image/svg+xml");
	expect(await resolveOpenversePhoto(svg)(openverseNeed)).toBe("invalid-image");
});

it("prefers the credentialed provider and only falls through when it had nothing", async () => {
	const load = vi.fn<typeof fetchAsset>(async (raw, _redirects, options) => {
		if (raw.includes("api.pexels.com"))
			return response(
				Buffer.from(JSON.stringify({ photos: [] })),
				"application/json",
			);
		return openverseTransport()(raw, 0, options);
	});
	const resolve = createStudioPhotoSource({ pexelsKey: "test-key", load });
	expect(await resolve(openverseNeed)).toMatchObject({
		provider: "Openverse",
		url: openversePhoto.url,
	});
	// A timeout is not retried elsewhere: a slow provider must fail honestly.
	const slow = vi.fn<typeof fetchAsset>((raw, _redirects, options) => {
		if (raw.includes("api.pexels.com"))
			return Promise.withResolvers<FetchedAsset>().promise;
		return openverseTransport()(raw, 0, options);
	});
	const stalled = createStudioPhotoSource({
		pexelsKey: "test-key",
		load: slow,
		deadlineMs: 80,
	});
	expect(await stalled(openverseNeed)).toBe("timeout");
	expect(
		slow.mock.calls.filter(([raw]) => raw.includes("api.openverse.org")),
	).toHaveLength(0);
});

it("answers keyless through Openverse when no Pexels credential exists", async () => {
	const load = openverseTransport();
	const resolve = createStudioPhotoSource({ load });
	expect(await resolve(openverseNeed)).toMatchObject({ provider: "Openverse" });
});
