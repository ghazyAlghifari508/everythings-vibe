// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectFeatureTree } from "@/db/schema";
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

	it("merender indikator checklist selesai pada task yang completed", () => {
		render(<WhiteboardCanvas projectName="Kurir Tracking" taskTree={TREE} />);
		expect(screen.getAllByText("Selesai").length).toBeGreaterThanOrEqual(1);
	});
});

describe("WhiteboardCanvas progressive skeleton", () => {
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

	it("memakai nama produk dan fitur riil, hanya TASKS yang memuat shimmer", () => {
		render(
			<WhiteboardCanvas
				projectName="Kasir Pintar"
				taskTree={{ features: [] }}
				featureTree={GREENFIELD_TREE}
			/>,
		);
		expect(screen.getByText("Kasir Pintar")).toBeDefined();
		expect(screen.getByText("Manajemen Produk")).toBeDefined();
		expect(screen.getByText("Checkout Pembayaran")).toBeDefined();
		expect(screen.getByText("Katalog Produk")).toBeDefined();
		expect(screen.getByText("Pembayaran Digital")).toBeDefined();
		expect(screen.getAllByText("TASKS")).toHaveLength(2);
	});

	it("container TASKS skeleton tidak menawarkan Lihat semua", () => {
		render(
			<WhiteboardCanvas
				projectName="Kasir Pintar"
				taskTree={{ features: [] }}
				featureTree={GREENFIELD_TREE}
			/>,
		);
		expect(screen.queryByRole("button", { name: /Lihat semua/i })).toBeNull();
	});

	it("container TASKS skeleton mengumumkan status sedang diproses", () => {
		render(
			<WhiteboardCanvas
				projectName="Kasir Pintar"
				taskTree={{ features: [] }}
				featureTree={GREENFIELD_TREE}
			/>,
		);
		const loadingContainers = screen.getAllByRole("img", {
			name: /TASKS .*sedang diproses/i,
		});
		expect(loadingContainers).toHaveLength(2);
	});
});
