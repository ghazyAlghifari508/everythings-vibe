// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { TaskTree } from "@/lib/services/task-service";
import { layoutTaskGraph } from "./whiteboard-canvas";

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

describe("layoutTaskGraph dengan subfitur", () => {
	it("membuat satu node subfitur per subfeatureId dan task bercabang darinya", () => {
		const { nodes, edges } = layoutTaskGraph(TREE_WITH_SUBFEATURES, "Toko");
		const subs = nodes.filter((n) => n.type === "subfeature");
		expect(subs.map((s) => s.label).sort()).toEqual(["Login OAuth", "Profil"]);
		const login = subs.find((s) => s.label === "Login OAuth");
		expect(login).toBeDefined();
		if (!login) return;
		const tasks = nodes.filter((n) => n.type === "task");
		expect(tasks).toHaveLength(3);
		for (const t of tasks) {
			expect(t.subfeatureName).toBeDefined();
		}
		const fromSub = edges.filter(
			(e) => Math.abs(e.x1 - (login.x + login.w)) < 1,
		);
		expect(fromSub.length).toBeGreaterThanOrEqual(2);
	});

	it("meneruskan status dan priority task ke node", () => {
		const { nodes } = layoutTaskGraph(TREE_WITH_SUBFEATURES, "Toko");
		const setup = nodes.find(
			(n) => n.type === "task" && n.label === "Setup OAuth",
		);
		expect(setup?.status).toBe("in_progress");
		expect(setup?.priority).toBe("high");
	});

	it("legacy tree tanpa subfeatureId tetap render tanpa node subfitur", () => {
		const { nodes, edges } = layoutTaskGraph(LEGACY_TREE, "Toko");
		expect(nodes.filter((n) => n.type === "subfeature")).toHaveLength(0);
		expect(nodes.filter((n) => n.type === "task")).toHaveLength(2);
		expect(nodes.filter((n) => n.type === "feature")).toHaveLength(1);
		expect(edges.length).toBeGreaterThan(0);
	});
});
