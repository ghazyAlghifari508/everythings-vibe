// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { ProjectFeatureTree } from "@/db/schema";
import type { TaskTree } from "@/lib/services/task-service";
import {
	containerH,
	featureIconName,
	getCanvasDotStyle,
	layoutTaskGraph,
	MAX_VISIBLE_CONTAINER_ROWS,
} from "./whiteboard-canvas";

function makeTask(
	name: string,
	extra?: Partial<TaskTree["features"][number]["tasks"][number]>,
): TaskTree["features"][number]["tasks"][number] {
	return {
		name,
		description: "",
		priority: "medium",
		covers: [],
		surfaces: [],
		subtasks: [],
		...extra,
	};
}

const TREE_WITH_SUBFEATURES: TaskTree = {
	features: [
		{
			name: "Autentikasi",
			tasks: [
				makeTask("Setup OAuth", {
					subfeatureId: "subfeat-1.1",
					subfeatureName: "Login OAuth",
					status: "in_progress",
					priority: "high",
					subtasks: [{ name: "Google client", description: "", details: [] }],
				}),
				makeTask("Refresh sesi", {
					subfeatureId: "subfeat-1.1",
					subfeatureName: "Login OAuth",
					status: "pending",
					priority: "medium",
					subtasks: [],
				}),
				makeTask("Halaman profil", {
					subfeatureId: "subfeat-1.2",
					subfeatureName: "Profil",
					status: "pending",
					priority: "low",
					subtasks: [],
				}),
			],
		},
	],
};

const LEGACY_TREE: TaskTree = {
	features: [
		{
			name: "Katalog",
			tasks: [
				makeTask("Kartu produk", { status: "completed", priority: "high" }),
				makeTask("Pencarian", { status: "pending", priority: "low" }),
			],
		},
	],
};

describe("layoutTaskGraph modular 4 kolom", () => {
	it("satu container SUB FITUR per fitur dengan 1 kabel putus-putus dari fitur", () => {
		const { nodes, edges } = layoutTaskGraph(TREE_WITH_SUBFEATURES, "Toko");
		const features = nodes.filter((n) => n.type === "feature");
		const subs = nodes.filter((n) => n.type === "subfeature");
		expect(features).toHaveLength(1);
		expect(subs).toHaveLength(1);
		const feature = features[0];
		const sub = subs[0];
		if (!feature || !sub) return;
		expect(sub.label).toBe("SUB FITUR");
		expect(sub.containerKind).toBe("subfeatures");
		expect(sub.rows?.map((r) => r.name).sort()).toEqual(
			["Login OAuth", "Profil"].sort(),
		);
		const outgoing = edges.filter(
			(e) => Math.abs(e.x1 - (feature.x + feature.w)) < 1,
		);
		expect(outgoing).toHaveLength(1);
		expect(outgoing[0]?.dashed).toBe(true);
		expect(outgoing[0]?.x2).toBe(sub.x);
	});

	it("satu container TASKS per fitur dengan 1 kabel dari SUB FITUR", () => {
		const { nodes, edges } = layoutTaskGraph(TREE_WITH_SUBFEATURES, "Toko");
		const tasks = nodes.filter((n) => n.type === "task");
		const subs = nodes.filter((n) => n.type === "subfeature");
		expect(tasks).toHaveLength(1);
		const task = tasks[0];
		const sub = subs[0];
		if (!task || !sub) return;
		expect(task.label).toBe("TASKS");
		expect(task.containerKind).toBe("tasks");
		expect(task.totalRows).toBe(3);
		expect(task.doneRows).toBe(0);
		const incoming = edges.filter(
			(e) =>
				Math.abs(e.x2 - task.x) < 1 && Math.abs(e.x1 - (sub.x + sub.w)) < 1,
		);
		expect(incoming).toHaveLength(1);
		expect(incoming[0]?.dashed).toBe(true);
	});

	it("menghitung progres selesai pada container TASKS", () => {
		const { nodes } = layoutTaskGraph(LEGACY_TREE, "Toko");
		const task = nodes.find((n) => n.type === "task");
		expect(task?.doneRows).toBe(1);
		expect(task?.totalRows).toBe(2);
	});

	it("legacy tree tanpa subfeatureId tetap satu container per kolom", () => {
		const { nodes, edges } = layoutTaskGraph(LEGACY_TREE, "Toko");
		expect(nodes.filter((n) => n.type === "subfeature")).toHaveLength(1);
		expect(nodes.filter((n) => n.type === "task")).toHaveLength(1);
		expect(nodes.filter((n) => n.type === "feature")).toHaveLength(1);
		expect(edges).toHaveLength(3);
	});

	it("containerH tumbuh sampai batas baris lalu datar", () => {
		const h3 = containerH(MAX_VISIBLE_CONTAINER_ROWS);
		expect(containerH(1)).toBeLessThan(h3);
		expect(containerH(MAX_VISIBLE_CONTAINER_ROWS + 5)).toBeGreaterThan(h3);
		expect(containerH(0)).toBe(containerH(1));
	});

	it("sinkronisasi SSOT dengan featureTree: nama bersih, fase sesuai, dan render seluruh subfitur", () => {
		const ssotTree = {
			productName: "Inventory POS",
			createdAt: "2026-09-30T00:00:00.000Z",
			features: [
				{
					id: "feat-1",
					name: "Manajemen Akun Tenant",
					phase: 1,
					description: "",
					subfeatures: [
						{ id: "subfeat-1.1", name: "Setup Akun", description: "" },
						{ id: "subfeat-1.2", name: "RBAC Role", description: "" },
						{ id: "subfeat-1.3", name: "Multi-Outlet", description: "" },
						{ id: "subfeat-1.4", name: "Audit Log", description: "" },
					],
				},
			],
		};

		const taskTreeWithPrefixAndFase0: TaskTree = {
			features: [
				{
					name: "Inisialisasi & Fondasi Infrastruktur",
					tasks: [makeTask("Setup DB", { status: "completed" })],
				},
				{
					name: "feat-1 Manajemen Akun Tenant",
					tasks: [
						makeTask("Implementasi RBAC", {
							subfeatureId: "subfeat-1.2",
							subfeatureName: "RBAC Role",
							status: "completed",
						}),
					],
				},
			],
		};

		const { nodes } = layoutTaskGraph(
			taskTreeWithPrefixAndFase0,
			"Inventory POS",
			ssotTree,
		);

		const features = nodes.filter((n) => n.type === "feature");
		expect(features).toHaveLength(1);
		expect(features[0]?.label).toBe("Manajemen Akun Tenant");
		expect(features[0]?.phase).toBe(1);

		const subfeatureNode = nodes.find((n) => n.type === "subfeature");
		expect(subfeatureNode).toBeDefined();
		expect(subfeatureNode?.rows).toHaveLength(4);
		expect(subfeatureNode?.rows?.map((r) => r.name)).toEqual([
			"Setup Akun",
			"RBAC Role",
			"Multi-Outlet",
			"Audit Log",
		]);
		expect(
			subfeatureNode?.rows?.find((r) => r.id === "subfeat-1.2")?.done,
		).toBe(true);
		expect(
			subfeatureNode?.rows?.find((r) => r.id === "subfeat-1.1")?.done,
		).toBe(false);

		const taskNode = nodes.find((n) => n.type === "task");
		expect(taskNode).toBeDefined();
		expect(taskNode?.rows).toHaveLength(1);
		expect(taskNode?.rows?.[0]?.name).toBe("Implementasi RBAC");
	});
});

describe("progressive skeleton dari featureTree saat taskTree kosong", () => {
	const GREENFIELD_TREE: ProjectFeatureTree = {
		productName: "Kasir Pintar",
		createdAt: "2026-09-30T00:00:00.000Z",
		features: [
			{
				id: "feat-1",
				name: "Manajemen Produk",
				phase: 1,
				description: "",
				subfeatures: [
					{ id: "subfeat-1.1", name: "Katalog Produk", description: "" },
					{ id: "subfeat-1.2", name: "Stok Gudang", description: "" },
				],
			},
			{
				id: "feat-2",
				name: "Checkout Pembayaran",
				phase: 2,
				description: "",
				subfeatures: [
					{ id: "subfeat-2.1", name: "Keranjang Belanja", description: "" },
					{ id: "subfeat-2.2", name: "Pembayaran Digital", description: "" },
				],
			},
		],
	};

	it("merender root, fitur, dan subfitur riil meski taskTree kosong", () => {
		const { nodes } = layoutTaskGraph(
			{ features: [] },
			"Kasir Pintar",
			GREENFIELD_TREE,
		);

		const root = nodes.find((n) => n.type === "root");
		expect(root?.label).toBe("Kasir Pintar");

		const features = nodes.filter((n) => n.type === "feature");
		expect(features).toHaveLength(2);
		expect(features.map((n) => n.label)).toEqual([
			"Manajemen Produk",
			"Checkout Pembayaran",
		]);
		expect(features.map((n) => n.phase)).toEqual([1, 2]);

		const subs = nodes.filter((n) => n.type === "subfeature");
		expect(subs).toHaveLength(2);
		expect(subs[0]?.rows?.map((r) => r.name)).toEqual([
			"Katalog Produk",
			"Stok Gudang",
		]);
		expect(subs[1]?.rows?.map((r) => r.name)).toEqual([
			"Keranjang Belanja",
			"Pembayaran Digital",
		]);
	});

	it("container TASKS jadi skeleton bersisi 3 baris tanpa merusak kabel", () => {
		const { nodes, edges } = layoutTaskGraph(
			{ features: [] },
			"Kasir Pintar",
			GREENFIELD_TREE,
		);

		const tasks = nodes.filter((n) => n.type === "task");
		expect(tasks).toHaveLength(2);
		for (const task of tasks) {
			expect(task.isSkeleton).toBe(true);
			expect(task.rows).toEqual([]);
			expect(task.totalRows).toBe(0);
			expect(task.doneRows).toBe(0);
			expect(task.h).toBe(containerH(MAX_VISIBLE_CONTAINER_ROWS));
		}

		// Root->Fitur, Fitur->SUB FITUR, SUB FITUR->TASKS: 3 kabel per fitur.
		expect(edges).toHaveLength(6);
		const subs = nodes.filter((n) => n.type === "subfeature");
		for (const sub of subs) {
			// Semua container SUB FITUR satu kolom, jadi y asal jadi pembeda.
			const outgoing = edges.filter(
				(e) =>
					Math.abs(e.x1 - (sub.x + sub.w)) < 1 &&
					Math.abs(e.y1 - (sub.y + sub.h / 2)) < 1,
			);
			expect(outgoing).toHaveLength(1);
			expect(outgoing[0]?.dashed).toBe(true);
		}
	});

	it("fallback kosong hanya saat featureTree dan taskTree keduanya kosong", () => {
		const empty = layoutTaskGraph({ features: [] }, "Kasir Pintar");
		expect(empty.nodes).toHaveLength(0);
		expect(empty.edges).toHaveLength(0);
		expect(empty.width).toBe(0);
		expect(empty.height).toBe(0);
	});
});

describe("featureIconName kontekstual tanpa sparkle", () => {
	it("memetakan kata kunci ke ikon yang sesuai", () => {
		expect(featureIconName("Dashboard Stok")).toBe("dashboard");
		expect(featureIconName("Catat Barang Masuk")).toBe("package");
		expect(featureIconName("Checkout Pesanan")).toBe("cart");
		expect(featureIconName("Profil Pengguna")).toBe("users");
		expect(featureIconName("Chat Bantuan")).toBe("chat");
		expect(featureIconName("Admin Panel")).toBe("shield");
		expect(featureIconName("Lacak Pengiriman")).toBe("truck");
		expect(featureIconName("Pencarian Produk")).toBe("search");
	});
});

describe("getCanvasDotStyle scaling proporsional terhadap zoom", () => {
	it("menghasilkan dotRadius yang membesar saat zoom in dan mengecil saat zoom out", () => {
		const pan = { x: 100, y: -50 };
		const styleZoomOut = getCanvasDotStyle(0.54, pan);
		const styleNormal = getCanvasDotStyle(1.0, pan);
		const styleZoomIn = getCanvasDotStyle(1.4, pan);

		expect(styleZoomOut.backgroundSize).toBe("10.8px 10.8px");
		expect(styleNormal.backgroundSize).toBe("20px 20px");
		expect(styleZoomIn.backgroundSize).toBe("28px 28px");

		expect(styleZoomOut.backgroundPosition).toBe("100px -50px");

		// Extract radius from radial-gradient string
		const extractRadius = (bgImage: string | undefined) => {
			const match = bgImage?.match(/rgba\(15, 23, 42, 0.16\)\)\s+([\d.]+)px/);
			return match ? parseFloat(match[1]) : 0;
		};

		const rOut = extractRadius(styleZoomOut.backgroundImage as string);
		const rNorm = extractRadius(styleNormal.backgroundImage as string);
		const rIn = extractRadius(styleZoomIn.backgroundImage as string);

		expect(rOut).toBeLessThan(rNorm);
		expect(rIn).toBeGreaterThan(rNorm);
		expect(rOut).toBeGreaterThanOrEqual(0.75); // clamped minimum
	});
});
