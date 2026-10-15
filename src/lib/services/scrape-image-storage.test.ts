import { describe, expect, it } from "vitest";
import {
	checkImageStorageQuota,
	validateStoredImage,
} from "./scrape-image-storage";

const png = Buffer.from(
	"89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082",
	"hex",
);

describe("private scrape image validation", () => {
	it("sniffs actual PNG bytes and rejects false MIME claims", () => {
		expect(validateStoredImage(png, "image/png").mimeType).toBe("image/png");
		expect(() => validateStoredImage(png, "image/jpeg")).toThrow();
		expect(() =>
			validateStoredImage(Buffer.from("<html>invalid</html>"), "image/png"),
		).toThrow();
	});
	it("fails closed on SVG, unknown, empty and oversized bytes", () => {
		for (const bytes of [
			Buffer.alloc(0),
			Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script/></svg>"),
			Buffer.alloc(15_000_001),
		]) {
			expect(() => validateStoredImage(bytes, "image/svg+xml")).toThrow();
		}
	});
	it("enforces exact scrape and owner quota boundaries", () => {
		expect(() =>
			checkImageStorageQuota(10, 90, 190, {
				scrapeBytes: 100,
				ownerBytes: 200,
			}),
		).not.toThrow();
		expect(() =>
			checkImageStorageQuota(11, 90, 190, {
				scrapeBytes: 100,
				ownerBytes: 200,
			}),
		).toThrow();
		expect(() =>
			checkImageStorageQuota(11, 0, 190, { scrapeBytes: 100, ownerBytes: 200 }),
		).toThrow();
	});
});
