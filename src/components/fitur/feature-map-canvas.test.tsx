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

describe("layoutFeatureGraph modular", () => {
	it("satu container SUB FITUR per fitur dengan 1 kabel putus-putus", () => {
		const { nodes, edges } = layoutFeatureGraph(TREE);
		const roots = nodes.filter((n) => n.type === "root");
		const features = nodes.filter((n) => n.type === "feature");
		const subs = nodes.filter((n) => n.type === "subfeature");
		expect(roots).toHaveLength(1);
		expect(roots[0]?.label).toBe("Toko Saya");
		expect(features).toHaveLength(3);
		expect(subs).toHaveLength(3);
		for (const sub of subs) {
			expect(sub.label).toBe("SUB FITUR");
			expect(sub.containerKind).toBe("subfeatures");
		}
		const auth = features.find((f) => f.label === "Autentikasi");
		if (!auth) return;
		const outgoing = edges.filter(
			(e) =>
				Math.abs(e.x1 - (auth.x + auth.w)) < 1 &&
				e.y1 >= auth.y - 1 &&
				e.y1 <= auth.y + auth.h + 1,
		);
		expect(outgoing).toHaveLength(1);
		expect(outgoing[0]?.dashed).toBe(true);
	});
	it("baris container memuat id, nama, dan deskripsi subfitur", () => {
		const { nodes } = layoutFeatureGraph(TREE);
		const auth = nodes.find(
			(n) => n.type === "subfeature" && n.ownerFeature === "Autentikasi",
		);
		expect(auth?.rows?.map((r) => r.name).sort()).toEqual(
			["Login OAuth", "Manajemen sesi"].sort(),
		);
		const login = auth?.rows?.find((r) => r.name === "Login OAuth");
		expect(login?.id).toBe("subfeat-1.1");
		expect(login?.description).toBe("Google dan GitHub");
		expect(auth?.totalRows).toBe(2);
	});

	it("menjaga urutan kolom root di kiri, fitur di tengah, container di kanan", () => {
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

	it("memusatkan fitur terhadap container subfiturnya", () => {
		const { nodes } = layoutFeatureGraph(TREE);
		const feature = nodes.find(
			(n) => n.type === "feature" && n.label === "Autentikasi",
		);
		const sub = nodes.find(
			(n) => n.type === "subfeature" && n.ownerFeature === "Autentikasi",
		);
		expect(feature).toBeDefined();
		expect(sub).toBeDefined();
		if (!feature || !sub) return;
		const featureMid = feature.y + feature.h / 2;
		const subMid = sub.y + sub.h / 2;
		expect(Math.abs(featureMid - subMid)).toBeLessThan(1);
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

	it("fitur tanpa subfitur tetap satu container kosong tanpa putus kabel", () => {
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
		expect(outgoing).toHaveLength(1);
		expect(
			nodes.filter(
				(n) => n.type === "subfeature" && n.ownerFeature === "Pengaturan",
			),
		).toHaveLength(1);
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
