import { describe, expect, it } from "vitest";
import type { ImageResult } from "../components/images-result-asset";
import {
	classifyImageFailureCode,
	extractHost,
	groupImageFailures,
} from "../utils/scrape-image-failures";

function makeImage(
	partial: Partial<ImageResult> & { id: string },
): ImageResult {
	return {
		id: partial.id,
		scrapeId: "scrape-1",
		userId: "user-1",
		url: partial.url ?? `https://images.ctfassets.net/item-${partial.id}.svg`,
		pageUrl: "https://example.com",
		format: partial.format ?? "svg",
		width: 100,
		height: 100,
		classification: null,
		evidence: { alt: null, sources: ["img"] },
		status: partial.status ?? "failed",
		assetId: null,
		httpStatus: partial.httpStatus ?? null,
		failureCode: partial.failureCode ?? null,
		error: partial.error ?? null,
		assetUrl: `/asset/${partial.id}`,
		...partial,
	};
}

describe("classifyImageFailureCode", () => {
	it("classifies HTTP 429, 401, 403 as access_restricted", () => {
		expect(classifyImageFailureCode(null, 429)).toBe("access_restricted");
		expect(classifyImageFailureCode(null, 401)).toBe("access_restricted");
		expect(classifyImageFailureCode(null, 403)).toBe("access_restricted");
	});

	it("classifies HTTP 404, 410, 500+ as connection_failed", () => {
		expect(classifyImageFailureCode(null, 404)).toBe("connection_failed");
		expect(classifyImageFailureCode(null, 410)).toBe("connection_failed");
		expect(classifyImageFailureCode(null, 500)).toBe("connection_failed");
		expect(classifyImageFailureCode(null, 503)).toBe("connection_failed");
	});

	it("classifies typed rate-limit and access codes as access_restricted", () => {
		expect(classifyImageFailureCode("WEBSITE_RATE_LIMITED", null)).toBe(
			"access_restricted",
		);
		expect(classifyImageFailureCode("WEBSITE_ACCESS_DENIED", null)).toBe(
			"access_restricted",
		);
		expect(classifyImageFailureCode("REMOTE_ACCESS_DENIED", null)).toBe(
			"access_restricted",
		);
	});

	it("classifies unsupported formats as format_unsupported", () => {
		expect(classifyImageFailureCode("UNSUPPORTED_FORMAT", null)).toBe(
			"format_unsupported",
		);
		expect(classifyImageFailureCode("UNSUPPORTED_MIME", null)).toBe(
			"format_unsupported",
		);
		expect(classifyImageFailureCode("INVALID_IMAGE", null)).toBe(
			"format_unsupported",
		);
	});

	it("classifies blocked URLs as security_rejected", () => {
		expect(classifyImageFailureCode("PRIVATE_URL_BLOCKED", null)).toBe(
			"security_rejected",
		);
		expect(classifyImageFailureCode("URL_BLOCKED", null)).toBe(
			"security_rejected",
		);
		expect(classifyImageFailureCode("REMOTE_REDIRECT_BLOCKED", null)).toBe(
			"security_rejected",
		);
	});

	it("classifies storage errors and quota exhaustion as storage_failed", () => {
		expect(classifyImageFailureCode("STORAGE_FAILED", null)).toBe(
			"storage_failed",
		);
		expect(classifyImageFailureCode("SCRAPE_STORAGE_QUOTA", null)).toBe(
			"storage_failed",
		);
		expect(classifyImageFailureCode("IMAGE_TOO_LARGE", null)).toBe(
			"storage_failed",
		);
	});

	it("classifies transport and network errors as connection_failed", () => {
		expect(classifyImageFailureCode("NETWORK", null)).toBe("connection_failed");
		expect(classifyImageFailureCode("NETWORK_FAILURE", null)).toBe(
			"connection_failed",
		);
		expect(classifyImageFailureCode("FETCH_TIMEOUT", null)).toBe(
			"connection_failed",
		);
		expect(classifyImageFailureCode("WEBSITE_SERVER_ERROR", null)).toBe(
			"connection_failed",
		);
	});

	it("falls back to unspecified for null or unrecognized codes without substring guesswork", () => {
		expect(classifyImageFailureCode(null, null)).toBe("unspecified");
		expect(classifyImageFailureCode("UNKNOWN_NEW_CODE", null)).toBe(
			"unspecified",
		);
		// Raw exception message is never matched
		expect(classifyImageFailureCode(undefined, null)).toBe("unspecified");
	});
});

describe("groupImageFailures", () => {
	it("groups 7 failed images into distinct typed buckets matching UX target", () => {
		const failed = [
			makeImage({ id: "1", failureCode: "WEBSITE_ACCESS_DENIED" }),
			makeImage({ id: "2", failureCode: "WEBSITE_RATE_LIMITED" }),
			makeImage({ id: "3", httpStatus: 403 }),
			makeImage({ id: "4", failureCode: "REMOTE_ACCESS_DENIED" }),
			makeImage({ id: "5", failureCode: "UNSUPPORTED_FORMAT" }),
			makeImage({ id: "6", failureCode: "UNSUPPORTED_MIME" }),
			makeImage({ id: "7", failureCode: "FETCH_TIMEOUT" }),
		];

		const groups = groupImageFailures(failed);

		expect(groups).toHaveLength(3);
		expect(groups[0].category.key).toBe("access_restricted");
		expect(groups[0].count).toBe(4);
		expect(groups[0].category.label).toBe("Website membatasi akses");

		expect(groups[1].category.key).toBe("format_unsupported");
		expect(groups[1].count).toBe(2);
		expect(groups[1].category.label).toBe("Format belum didukung");

		expect(groups[2].category.key).toBe("connection_failed");
		expect(groups[2].count).toBe(1);
		expect(groups[2].category.label).toBe("Gagal karena gangguan sementara");
	});

	it("handles all images with the same error type without duplication", () => {
		const failed = Array.from({ length: 23 }, (_, i) =>
			makeImage({
				id: `svg-${i}`,
				failureCode: "UNSUPPORTED_FORMAT",
				url: `https://images.ctfassets.net/asset-${i}.svg`,
				error: "SVG tidak disimpan karena keamanan",
			}),
		);

		const groups = groupImageFailures(failed);

		expect(groups).toHaveLength(1);
		expect(groups[0].count).toBe(23);
		expect(groups[0].category.label).toBe("Format belum didukung");
		expect(groups[0].images).toHaveLength(23);
	});

	it("returns empty array when there are no failed images", () => {
		expect(groupImageFailures([])).toEqual([]);
	});
});

describe("extractHost", () => {
	it("extracts hostname cleanly from full URLs", () => {
		expect(extractHost("https://images.ctfassets.net/path/to/img.png")).toBe(
			"images.ctfassets.net",
		);
		expect(extractHost("http://cdn.example.com/asset.webp?v=1")).toBe(
			"cdn.example.com",
		);
	});

	it("returns fallback for invalid URLs", () => {
		expect(extractHost("not-a-valid-url")).toBe("sumber");
	});
});
