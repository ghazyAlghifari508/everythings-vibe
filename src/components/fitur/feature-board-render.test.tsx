// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ProjectFeatureTree } from "@/db/schema";
import { FeatureMapCanvas } from "./feature-map-canvas";

const TREE: ProjectFeatureTree = {
	productName: "Kurir Tracking",
	createdAt: "2026-09-29T00:00:00.000Z",
	features: [
		{
			id: "feat-1",
			name: "Dashboard Stok",
			phase: 1,
			description: "Ringkasan stok",
			subfeatures: [
				{ id: "subfeat-1.1", name: "Ringkasan", description: "Total stok" },
				{ id: "subfeat-1.2", name: "Grafik", description: "Tren harian" },
				{ id: "subfeat-1.3", name: "Ekspor", description: "Unduh CSV" },
				{ id: "subfeat-1.4", name: "Arsip", description: "Data lama" },
			],
		},
		{
			id: "feat-2",
			name: "Catat Barang Masuk",
			phase: 2,
			description: "Pencatatan",
			subfeatures: [
				{ id: "subfeat-2.1", name: "Form masuk", description: "Input barang" },
			],
		},
	],
};

afterEach(() => {
	cleanup();
	document.body.innerHTML = "";
});

describe("FeatureMapCanvas modular", () => {
	it("satu container SUB FITUR per fitur dengan badge fase dan ikon kontekstual", () => {
		render(
			<FeatureMapCanvas productName="Kurir Tracking" featureTree={TREE} />,
		);
		expect(screen.getAllByText("SUB FITUR")).toHaveLength(2);
		expect(screen.getByText("Dashboard Stok")).toBeDefined();
		expect(screen.getByText("Catat Barang Masuk")).toBeDefined();
		expect(screen.getByText("Fase 1")).toBeDefined();
		expect(screen.getByText("Fase 2")).toBeDefined();
		expect(screen.getByText("Kurir Tracking")).toBeDefined();
		expect(screen.getByText("Ringkasan")).toBeDefined();
	});

	it("tanpa sparkle: tidak ada ikon sparkles, stars, atau wand", () => {
		const { container } = render(
			<FeatureMapCanvas productName="Kurir Tracking" featureTree={TREE} />,
		);
		const svgNames = Array.from(container.querySelectorAll("svg")).map(
			(s) => s.getAttribute("data-lucide") ?? s.innerHTML.slice(0, 80),
		);
		const joined = svgNames.join(" ");
		expect(joined.toLowerCase()).not.toContain("sparkle");
		expect(joined.toLowerCase()).not.toContain("wand");
	});

	it("Lihat semua membuka modal deskripsi lengkap", () => {
		render(
			<FeatureMapCanvas productName="Kurir Tracking" featureTree={TREE} />,
		);
		const opener = screen.getByRole("button", { name: /Lihat semua \(4\)/i });
		fireEvent.click(opener);
		expect(screen.getByText("Total stok")).toBeDefined();
		expect(screen.getByText("Unduh CSV")).toBeDefined();
		fireEvent.click(screen.getByRole("button", { name: /Tutup daftar/i }));
		expect(screen.queryByText("Total stok")).toBeNull();
	});
});
