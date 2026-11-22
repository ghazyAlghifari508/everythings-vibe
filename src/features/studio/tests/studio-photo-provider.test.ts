import { expect, it, vi } from "vitest";
import type { FetchedAsset, fetchAsset } from "@/lib/fetch-html";
import { resolvePexelsPhoto } from "@/lib/pexels-photos";

const url = "https://images.pexels.com/photos/25/photo.jpeg";
const candidate = {
	id: 25,
	width: 1200,
	height: 800,
	url: "https://www.pexels.com/photo/lake-25/",
	photographer: "Ada",
	alt: "Lake Batur at dawn",
	src: { large: url },
};
const need = { query: "Lake Batur", aspect: "landscape" as const };
function transport(photo = candidate, mime = "image/jpeg") {
	return vi.fn<typeof fetchAsset>(async (raw) => ({
		status: 200,
		finalUrl: raw,
		contentType: raw.includes("api.pexels.com") ? "application/json" : mime,
		body: raw.includes("api.pexels.com")
			? Buffer.from(JSON.stringify({ photos: [photo] }))
			: Buffer.from("ffd8ffc0000b08032004b001011100ffd9", "hex"),
	}));
}

it("resolves and deduplicates an approved, credited raster photo", async () => {
	const load = transport();
	const resolve = resolvePexelsPhoto("test-key", load);
	const [first, second] = await Promise.all([resolve(need), resolve(need)]);
	expect(first).toEqual({
		url,
		width: 1200,
		height: 800,
		photographer: "Ada",
		source: candidate.url,
		alt: candidate.alt,
	});
	expect(second).toEqual(first);
	expect(load).toHaveBeenCalledTimes(2);
	expect(load.mock.calls[1]?.[2]?.authorization).toBeUndefined();
});

it("never fetches off-provider results and rejects unsupported responses", async () => {
	const unsafe = transport({
		...candidate,
		src: { large: "https://localhost/photo.jpeg" },
	});
	expect(await resolvePexelsPhoto("test", unsafe)(need)).toBe("no-match");
	expect(unsafe).toHaveBeenCalledTimes(1);
	expect(
		await resolvePexelsPhoto(
			"test",
			transport(candidate, "image/svg+xml"),
		)(need),
	).toBe("invalid-image");
});

it("times out without blocking an independent unrelated frame", async () => {
	const load = vi.fn<typeof fetchAsset>((raw, _, options) => {
		if (new URL(raw).searchParams.get("query") === "mountain")
			return Promise.withResolvers<FetchedAsset>().promise;
		return transport()(raw, 0, options);
	});
	const resolve = resolvePexelsPhoto("test", load, 80);
	const delayed = resolve({ ...need, query: "Mountain" });
	expect(await resolve(need)).toMatchObject({ url });
	expect(await delayed).toBe("timeout");
});
