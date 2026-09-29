// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ProjectFeatureTree } from "@/db/schema";
import {
	featureTreeHasContent,
	groupTasksBySubfeature,
	taskSubfeatureRef,
} from "./feature-view";

function makeTree(
	features: ProjectFeatureTree["features"],
): ProjectFeatureTree {
	return {
		productName: "Toko Saya",
		features,
		createdAt: "2026-09-29T00:00:00.000Z",
	};
}

describe("featureTreeHasContent", () => {
	it("menerima tree dengan minimal satu fitur", () => {
		expect(
			featureTreeHasContent(
				makeTree([
					{
						id: "feat-1",
						name: "Autentikasi",
						phase: 1,
						description: "Login dan sesi pengguna",
						subfeatures: [],
					},
				]),
			),
		).toBe(true);
	});

	it("menolak null, undefined, dan tree tanpa fitur", () => {
		expect(featureTreeHasContent(null)).toBe(false);
		expect(featureTreeHasContent(undefined)).toBe(false);
		expect(featureTreeHasContent(makeTree([]))).toBe(false);
	});
});

describe("taskSubfeatureRef", () => {
	it("membaca id dan nama subfitur", () => {
		expect(
			taskSubfeatureRef({
				name: "t",
				subfeatureId: "s1",
				subfeatureName: "Auth",
			}),
		).toEqual({ id: "s1", name: "Auth" });
	});

	it("memakai id sebagai nama saat nama absen", () => {
		expect(taskSubfeatureRef({ name: "t", subfeatureId: "s1" })).toEqual({
			id: "s1",
			name: "s1",
		});
	});

	it("mengembalikan null saat tidak ada subfeatureId", () => {
		expect(taskSubfeatureRef({ name: "t" })).toBeNull();
		expect(taskSubfeatureRef({ name: "t", subfeatureId: 42 })).toBeNull();
		expect(taskSubfeatureRef(null)).toBeNull();
		expect(taskSubfeatureRef("tugas")).toBeNull();
	});
});

describe("groupTasksBySubfeature", () => {
	it("mengelompokkan task ber-subfeatureId sama dan menjaga urutan kemunculan", () => {
		const groups = groupTasksBySubfeature([
			{ name: "a", subfeatureId: "s1", subfeatureName: "Auth" },
			{ name: "b" },
			{ name: "c", subfeatureId: "s1", subfeatureName: "Auth" },
			{ name: "d", subfeatureId: "s2" },
		]);
		expect(groups.map((g) => g.taskIndexes)).toEqual([[0, 2], [1], [3]]);
		expect(groups[0].subfeatureName).toBe("Auth");
		expect(groups[1].subfeatureName).toBeNull();
		expect(groups[2].subfeatureName).toBe("s2");
		expect(groups.map((g) => g.key)).toEqual(["s1", "__task:1", "s2"]);
	});

	it("menempatkan tiap legacy task tanpa subfeatureId di grup sendiri", () => {
		const groups = groupTasksBySubfeature([{ name: "a" }, { name: "b" }]);
		expect(groups).toHaveLength(2);
		expect(groups.every((g) => g.subfeatureName === null)).toBe(true);
	});

	it("mengembalikan array kosong untuk input kosong", () => {
		expect(groupTasksBySubfeature([])).toEqual([]);
	});
});
