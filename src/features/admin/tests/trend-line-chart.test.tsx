// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TrendLineChart } from "../components/trend-line-chart";
import type { DailyTrendPoint } from "../types";

const mockTrendData: DailyTrendPoint[] = [
	{ date: "2026-08-21", label: "21 Agu", revenue: 100000, newUsers: 2 },
	{ date: "2026-08-22", label: "22 Agu", revenue: 200000, newUsers: 5 },
	{ date: "2026-08-23", label: "23 Agu", revenue: 150000, newUsers: 3 },
	{ date: "2026-08-24", label: "24 Agu", revenue: 300000, newUsers: 8 },
	{ date: "2026-08-25", label: "25 Agu", revenue: 50000, newUsers: 1 },
	{ date: "2026-08-26", label: "26 Agu", revenue: 400000, newUsers: 10 },
	{ date: "2026-08-27", label: "27 Agu", revenue: 250000, newUsers: 6 },
];

describe("TrendLineChart Component", () => {
	let container: HTMLDivElement;
	let root: Root | null = null;

	beforeEach(() => {
		(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		if (root) {
			act(() => {
				root?.unmount();
			});
			root = null;
		}
		container?.remove();
	});

	it("renders title, subtitle, and range filter buttons", () => {
		act(() => {
			root?.render(<TrendLineChart initialData={mockTrendData} />);
		});

		expect(container.textContent).toContain("Tren 7 Hari Terakhir");
		expect(container.textContent).toContain(
			"Performa pendapatan dan pendaftaran baru dari data nyata.",
		);
		const buttons = container.querySelectorAll("button");
		const buttonTexts = Array.from(buttons).map((b) => b.textContent?.trim());
		expect(buttonTexts).toContain("7 Hari");
		expect(buttonTexts).toContain("14 Hari");
		expect(buttonTexts).toContain("30 Hari");
	});

	it("triggers onRangeChange callback and updates header when range button is clicked", () => {
		const handleRangeChange = vi.fn();

		act(() => {
			root?.render(
				<TrendLineChart
					initialData={mockTrendData}
					onRangeChange={handleRangeChange}
				/>,
			);
		});

		const buttons = container.querySelectorAll("button");
		const pill14 = Array.from(buttons).find((b) =>
			b.textContent?.includes("14 Hari"),
		);
		expect(pill14).toBeDefined();

		act(() => {
			pill14?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(handleRangeChange).toHaveBeenCalledWith(14);
		expect(container.textContent).toContain("Tren 14 Hari Terakhir");
	});

	it("displays currency in legend", () => {
		act(() => {
			root?.render(<TrendLineChart initialData={mockTrendData} />);
		});

		// Total revenue: 100k + 200k + 150k + 300k + 50k + 400k + 250k = 1.450.000
		expect(container.textContent).toContain("1.450.000");
		expect(container.textContent).toContain("35"); // total new users: 2+5+3+8+1+10+6 = 35
	});

	it("renders SVG spline and area paths with valid cubic bezier commands", () => {
		act(() => {
			root?.render(<TrendLineChart initialData={mockTrendData} />);
		});

		const paths = container.querySelectorAll("path");
		expect(paths.length).toBeGreaterThanOrEqual(2);

		const pathDValues = Array.from(paths).map((p) => p.getAttribute("d"));
		expect(pathDValues.some((d) => d?.includes("C"))).toBe(true);
		expect(pathDValues.some((d) => d?.includes("Z"))).toBe(true);
	});

	it("renders empty state placeholder when no data is provided", () => {
		act(() => {
			root?.render(<TrendLineChart initialData={[]} />);
		});

		expect(container.textContent).toContain(
			"Belum ada data tren untuk periode ini",
		);
	});
});
