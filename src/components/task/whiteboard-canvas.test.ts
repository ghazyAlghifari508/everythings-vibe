// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { TaskTree } from "@/lib/services/task-service";
import {
	containerH,
	featureIconName,
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
