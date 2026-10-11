import { describe, expect, it } from "vitest";
import {
	assessRevisionImpact,
	buildRevisionRequest,
	describeRevisionImpact,
	resolveIntentOptions,
} from "./codebase-revision-intent";

describe("resolveIntentOptions", () => {
	it("offers only the new-feature intent before anything exists to revise", () => {
		const options = resolveIntentOptions({ hasExistingFeature: false });
		expect(options.map((option) => option.intent)).toEqual(["new_feature"]);
	});

	it("offers both real intents once a feature exists", () => {
		const options = resolveIntentOptions({ hasExistingFeature: true });
		expect(options.map((option) => option.intent)).toEqual([
			"revise_current",
			"new_feature",
		]);
	});

	it("explains the consequence of each intent", () => {
		for (const option of resolveIntentOptions({ hasExistingFeature: true })) {
			expect(option.label.length).toBeGreaterThan(0);
			expect(option.description.length).toBeGreaterThan(0);
		}
		const [revise, newFeature] = resolveIntentOptions({
			hasExistingFeature: true,
		});
		// A new feature must state that the current work is preserved.
		expect(newFeature?.description).toMatch(/tetap tersimpan|tidak terhapus/i);
		// A revision must state that the previous document is kept.
		expect(revise?.description).toMatch(/versi baru|tetap tersimpan/i);
	});
});

describe("assessRevisionImpact", () => {
	it("needs no confirmation when every task is still pending", () => {
		const impact = assessRevisionImpact([
			{ status: "pending" },
			{ status: "pending" },
		]);
		expect(impact.affectedTaskCount).toBe(0);
		expect(impact.requiresTaskReplacementConfirmation).toBe(false);
	});

	it("requires confirmation once real progress exists", () => {
		const impact = assessRevisionImpact([
			{ status: "completed" },
			{ status: "in_progress" },
			{ status: "failed" },
			{ status: "pending" },
		]);
		expect(impact.affectedTaskCount).toBe(3);
		expect(impact.completedCount).toBe(1);
		expect(impact.inProgressCount).toBe(1);
		expect(impact.failedCount).toBe(1);
		expect(impact.requiresTaskReplacementConfirmation).toBe(true);
	});

	it("treats an empty task list as nothing to protect", () => {
		const impact = assessRevisionImpact([]);
		expect(impact.affectedTaskCount).toBe(0);
		expect(impact.requiresTaskReplacementConfirmation).toBe(false);
	});
});

describe("describeRevisionImpact", () => {
	it("states that tasks stay untouched when nothing is at risk", () => {
		const text = describeRevisionImpact(
			assessRevisionImpact([{ status: "pending" }]),
		);
		expect(text).toMatch(/status Kanban tetap utuh/i);
	});

	it("names the real counts and the consequence of replacing tasks", () => {
		const text = describeRevisionImpact(
			assessRevisionImpact([
				{ status: "completed" },
				{ status: "completed" },
				{ status: "in_progress" },
			]),
		);
		expect(text).toContain("2 task selesai");
		expect(text).toContain("1 task sedang dikerjakan");
		expect(text).toMatch(/mereset progres/i);
		expect(text).toMatch(/tidak diubah/i);
	});

	it("never reports a count for a status that has no task", () => {
		const text = describeRevisionImpact(
			assessRevisionImpact([{ status: "completed" }]),
		);
		expect(text).toContain("1 task selesai");
		expect(text).not.toContain("sedang dikerjakan");
		expect(text).not.toContain("task gagal");
	});
});

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
