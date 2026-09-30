// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { TaskTree } from "@/lib/services/task-service";
import { WhiteboardCanvas } from "./whiteboard-canvas";

const TREE: TaskTree = {
	features: [
		{
			name: "Dashboard Stok",
			tasks: [
				{
					name: "Bangun ringkasan",
					description: "",
					priority: "medium",
					covers: [],
					surfaces: [],
					subfeatureId: "subfeat-1.1",
					subfeatureName: "Ringkasan",
					status: "completed",
					subtasks: [
						{ name: "Ambil total", description: "", details: ["Via API"] },
					],
				},
				{
					name: "Bangun grafik",
					description: "",
					priority: "medium",
					covers: [],
					surfaces: [],
					subfeatureId: "subfeat-1.2",
					subfeatureName: "Grafik",
					status: "pending",
					subtasks: [],
				},
				{
					name: "Bangun ekspor",
					description: "",
					priority: "medium",
					covers: [],
					surfaces: [],
					subfeatureId: "subfeat-1.2",
					subfeatureName: "Grafik",
					status: "pending",
					subtasks: [],
				},
				{
					name: "Bangun arsip",
					description: "",
					priority: "medium",
					covers: [],
					surfaces: [],
					subfeatureId: "subfeat-1.2",
					subfeatureName: "Grafik",
					status: "pending",
					subtasks: [],
				},
			],
		},
	],
};
afterEach(() => {
	cleanup();
	document.body.innerHTML = "";
});

describe("WhiteboardCanvas modular", () => {
	it("rantai Root -> Fitur -> SUB FITUR -> TASKS dengan progres", () => {
		render(<WhiteboardCanvas projectName="Kurir Tracking" taskTree={TREE} />);
		expect(screen.getByText("Kurir Tracking")).toBeDefined();
		expect(screen.getByText("Dashboard Stok")).toBeDefined();
		expect(screen.getByText("SUB FITUR")).toBeDefined();
		expect(screen.getByText("TASKS")).toBeDefined();
		expect(screen.getByText("Fase 1")).toBeDefined();
		expect(screen.getAllByText("1/4")).toHaveLength(2);
	});

	it("Lihat semua TASKS membuka modal checklist dengan subtask", () => {
		render(<WhiteboardCanvas projectName="Kurir Tracking" taskTree={TREE} />);
		const opener = screen.getByRole("button", { name: /Lihat semua \(4\)/i });
		fireEvent.click(opener);
		expect(screen.getAllByText("Bangun ringkasan")).toHaveLength(2);
		expect(screen.getByText("Ambil total")).toBeDefined();
		expect(screen.getByText(/Via API/)).toBeDefined();
	});
});
