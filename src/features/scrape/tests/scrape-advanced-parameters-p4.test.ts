import { describe, expect, it } from "vitest";
import type { RenderedImage } from "@/features/scrape/services/render-page-helpers";
import {
	ADVANCED_PARAMETER_GROUPS,
	fromDisplayValue,
	toDisplayValue,
	validateNumericParameter,
} from "@/features/scrape/types/parameter-spec";
import {
	htmlSettingsSchema,
	imagesSettingsSchema,
	SCRAPE_LIMITS,
} from "@/features/scrape/types/scrape-contract";
import { normalizeImageCandidates } from "@/features/scrape/utils/scrape-images";

describe("P4 Scrape HTML and Scrape Images Advanced Parameters", () => {
	describe("Contract and schema validation", () => {
		it("htmlSettingsSchema defaults waitMs to 0 and includeIframes to false", () => {
			const parsed = htmlSettingsSchema.parse({});
			expect(parsed.waitMs).toBe(0);
			expect(parsed.includeIframes).toBe(false);
		});

		it("htmlSettingsSchema rejects waitMs over limit or negative", () => {
			expect(() =>
				htmlSettingsSchema.parse({ waitMs: SCRAPE_LIMITS.waitMs + 1 }),
			).toThrow();
			expect(() => htmlSettingsSchema.parse({ waitMs: -1 })).toThrow();
		});

		it("imagesSettingsSchema defaults waitMs to 0, measureResolution to true, classifyType to true", () => {
			const parsed = imagesSettingsSchema.parse({});
			expect(parsed.waitMs).toBe(0);
			expect(parsed.measureResolution).toBe(true);
			expect(parsed.classifyType).toBe(true);
		});

		it("imagesSettingsSchema rejects waitMs over limit or negative", () => {
			expect(() =>
				imagesSettingsSchema.parse({ waitMs: SCRAPE_LIMITS.waitMs + 1 }),
			).toThrow();
			expect(() => imagesSettingsSchema.parse({ waitMs: -1 })).toThrow();
		});
	});

	describe("Parameter spec display conversions and Indonesian copy", () => {
		it("scales waitMs by 1000 for display in seconds", () => {
			const htmlGroup = ADVANCED_PARAMETER_GROUPS.html[0];
			const waitSpec = htmlGroup?.numbers.find((spec) => spec.key === "waitMs");
			expect(waitSpec).toBeDefined();
			if (!waitSpec) return;

			expect(waitSpec.unit).toBe("detik");
			expect(waitSpec.min).toBe(0);
			expect(waitSpec.max).toBe(10);
			expect(waitSpec.scale).toBe(1000);

			expect(toDisplayValue(waitSpec, 0)).toBe(0);
			expect(toDisplayValue(waitSpec, 4000)).toBe(4);
			expect(toDisplayValue(waitSpec, 10000)).toBe(10);

			expect(fromDisplayValue(waitSpec, 0)).toBe(0);
			expect(fromDisplayValue(waitSpec, 4)).toBe(4000);
			expect(fromDisplayValue(waitSpec, 10)).toBe(10000);

			expect(validateNumericParameter(waitSpec, 5)).toBeNull();
			expect(validateNumericParameter(waitSpec, 11)?.message).toMatch(
				/antara 0 dan 10 detik/i,
			);
		});

		it("uses plain Indonesian labels for all toggles", () => {
			const htmlToggles = ADVANCED_PARAMETER_GROUPS.html[0]?.toggles ?? [];
			const imagesToggles = ADVANCED_PARAMETER_GROUPS.images[0]?.toggles ?? [];

			const iframeToggle = htmlToggles.find((t) => t.key === "includeIframes");
			expect(iframeToggle?.label).toBe("Sertakan konten tertanam");

			const measureToggle = imagesToggles.find(
				(t) => t.key === "measureResolution",
			);
			expect(measureToggle?.label).toBe("Periksa ukuran asli gambar");

			const classifyToggle = imagesToggles.find(
				(t) => t.key === "classifyType",
			);
			expect(classifyToggle?.label).toBe("Kelompokkan ikon dan logo");
		});
	});

	describe("Image pipeline respects classifyType toggle", () => {
		const sampleCandidates: RenderedImage[] = [
			{
				url: "https://example.com/favicon.ico",
				source: "icon",
				alt: null,
				width: 32,
				height: 32,
			},
			{
				url: "https://example.com/company-logo.png",
				source: "img",
				alt: "Company Brand Logo",
				width: 200,
				height: 50,
			},
			{
				url: "https://example.com/hero.jpg",
				source: "img",
				alt: "Scenic view",
				width: 1200,
				height: 800,
			},
		];

		it("classifies icons and logos when classify is true", () => {
			const processed = normalizeImageCandidates(sampleCandidates, true);
			const icon = processed.find((i) => i.url.includes("favicon"));
			const logo = processed.find((i) => i.url.includes("logo"));
			const hero = processed.find((i) => i.url.includes("hero"));

			expect(icon?.classification).toBe("icon");
			expect(icon?.evidence.classificationReason).toBe("HTML link rel icon");

			expect(logo?.classification).toBe("logo");
			expect(logo?.evidence.classificationReason).toBe(
				"Image alt identifies logo",
			);

			expect(hero?.classification).toBeNull();
		});

		it("leaves all classifications null when classify is false", () => {
			const processed = normalizeImageCandidates(sampleCandidates, false);
			for (const img of processed) {
				expect(img.classification).toBeNull();
				expect(img.evidence.classificationReason).toBeUndefined();
			}
		});
	});
});
