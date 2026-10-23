import { describe, expect, it } from "vitest";
import { buildRevisionRequest } from "@/features/codebase/services/revision-intent";

describe("buildRevisionRequest", () => {
	it("carries the user's instruction and bounds the scope to affected parts", () => {
		const message = buildRevisionRequest({
			featureName: "Ekspor Ringkasan",
			instruction: "Tambahkan opsi ekspor ke Markdown",
		});
		expect(message).toContain("Ekspor Ringkasan");
		expect(message).toContain("Tambahkan opsi ekspor ke Markdown");
		expect(message).toMatch(/bagian yang benar-benar terdampak/i);
	});

	it("falls back to a neutral name when the feature name is blank", () => {
		const message = buildRevisionRequest({
			featureName: "   ",
			instruction: "Perbaiki alur",
		});
		expect(message).toContain("fitur ini");
		expect(message).toContain("Perbaiki alur");
	});
});
