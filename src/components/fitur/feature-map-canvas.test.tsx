// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ProjectFeatureTree } from "@/db/schema";
import { layoutFeatureGraph } from "./feature-map-canvas";

const TREE: ProjectFeatureTree = {
	productName: "Toko Saya",
	createdAt: "2026-09-29T00:00:00.000Z",
	features: [
		{
			id: "feat-1",
			name: "Autentikasi",
			phase: 1,
			description: "Login dan sesi pengguna",
			subfeatures: [
				{
					id: "subfeat-1.1",
					name: "Login OAuth",
					description: "Google dan GitHub",
				},
				{
					id: "subfeat-1.2",
					name: "Manajemen sesi",
					description: "Refresh dan logout",
				},
			],
		},
		{
			id: "feat-2",
			name: "Katalog",
			phase: 2,
			description: "Jelajah produk",
			subfeatures: [
				{
					id: "subfeat-2.1",
					name: "Pencarian",
					description: "Cari dan filter",
				},
			],
		},
		{
			id: "feat-3",
			name: "Pengaturan",
			phase: 3,
			description: "Preferensi akun",
			subfeatures: [],
		},
	],
};

describe("layoutFeatureGraph", () => {
	it("memetakan root, fitur, dan subfitur menjadi node dan edge yang tersambung", () => {
		const { nodes, edges } = layoutFeatureGraph(TREE);
		const roots = nodes.filter((n) => n.type === "root");
		const features = nodes.filter((n) => n.type === "feature");
		const subs = nodes.filter((n) => n.type === "subfeature");
		expect(roots).toHaveLength(1);
		expect(roots[0].label).toBe("Toko Saya");
		expect(features).toHaveLength(3);
		expect(subs).toHaveLength(3);
		expect(edges).toHaveLength(3 + 3);
	});

	it("menjaga urutan kolom root di kiri, fitur di tengah, subfitur di kanan", () => {
		const { nodes } = layoutFeatureGraph(TREE);
		const root = nodes.find((n) => n.type === "root");
		const features = nodes.filter((n) => n.type === "feature");
		const subs = nodes.filter((n) => n.type === "subfeature");
		expect(root).toBeDefined();
		if (!root) return;
		for (const f of features) {
			expect(f.x).toBeGreaterThanOrEqual(root.x + root.w);
		}
		for (const s of subs) {
			const owner = features.find((f) => f.label === s.ownerFeature);
			expect(owner).toBeDefined();
			if (!owner) continue;
			expect(s.x).toBeGreaterThanOrEqual(owner.x + owner.w);
		}
	});

	it("memusatkan fitur terhadap tumpukan subfiturnya", () => {
		const { nodes } = layoutFeatureGraph(TREE);
		const feature = nodes.find(
			(n) => n.type === "feature" && n.label === "Autentikasi",
		);
		const subs = nodes.filter(
			(n) => n.type === "subfeature" && n.ownerFeature === "Autentikasi",
		);
		expect(feature).toBeDefined();
		expect(subs).toHaveLength(2);
		if (!feature) return;
		const featureMid = feature.y + feature.h / 2;
		const stackMid =
			(Math.min(...subs.map((s) => s.y)) +
				Math.max(...subs.map((s) => s.y + s.h))) /
			2;
		expect(Math.abs(featureMid - stackMid)).toBeLessThan(1);
	});

	it("mempertahankan fase dan deskripsi backend pada node fitur", () => {
		const { nodes } = layoutFeatureGraph(TREE);
		const katalog = nodes.find(
			(n) => n.type === "feature" && n.label === "Katalog",
		);
		expect(katalog?.phase).toBe(2);
		expect(katalog?.description).toBe("Jelajah produk");
		const autentikasi = nodes.find(
			(n) => n.type === "feature" && n.label === "Autentikasi",
		);
		expect(autentikasi?.phase).toBe(1);
	});

	it("mempertahankan id dan deskripsi subfitur pada node", () => {
		const { nodes } = layoutFeatureGraph(TREE);
		const pencarian = nodes.find(
			(n) => n.type === "subfeature" && n.label === "Pencarian",
		);
		expect(pencarian?.description).toBe("Cari dan filter");
		expect(pencarian?.ownerFeature).toBe("Katalog");
	});

	it("merender fitur tanpa subfitur sebagai node tunggal tanpa edge lanjutan", () => {
		const { nodes, edges } = layoutFeatureGraph(TREE);
		const pengaturan = nodes.find(
			(n) => n.type === "feature" && n.label === "Pengaturan",
		);
		expect(pengaturan).toBeDefined();
		if (!pengaturan) return;
		const outgoing = edges.filter(
			(e) =>
				Math.abs(e.x1 - (pengaturan.x + pengaturan.w)) < 1 &&
				e.y1 >= pengaturan.y - 1 &&
				e.y1 <= pengaturan.y + pengaturan.h + 1,
		);
		expect(outgoing).toHaveLength(0);
		expect(
			nodes.filter(
				(n) => n.type === "subfeature" && n.ownerFeature === "Pengaturan",
			),
		).toHaveLength(0);
	});

	it("mengembalikan kanvas kosong untuk tree tanpa fitur", () => {
		const { nodes, edges, width, height } = layoutFeatureGraph({
			productName: "Toko Saya",
			createdAt: "2026-09-29T00:00:00.000Z",
			features: [],
		});
		expect(nodes).toEqual([]);
		expect(edges).toEqual([]);
		expect(width).toBe(0);
		expect(height).toBe(0);
	});

	it("memberi dimensi positif untuk tree berisi", () => {
		const { width, height } = layoutFeatureGraph(TREE);
		expect(width).toBeGreaterThan(0);
		expect(height).toBeGreaterThan(0);
	});
});
