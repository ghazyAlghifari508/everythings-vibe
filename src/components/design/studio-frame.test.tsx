// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioFrame } from "./studio-frame";
import { StudioFrameSkeleton } from "./studio-frame-skeleton";

describe("StudioFrameSkeleton", () => {
	afterEach(() => cleanup());

	it("renders mobile skeleton with mobile layout elements", () => {
		const { container } = render(
			<StudioFrameSkeleton viewport="mobile" name="Dashboard" />,
		);
		expect(screen.getByText("Dashboard")).toBeDefined();
		expect(
			container.querySelector('[data-testid="mobile-skeleton"]'),
		).toBeDefined();
	});

	it("renders web skeleton with desktop layout elements", () => {
		const { container } = render(
			<StudioFrameSkeleton viewport="web" name="Analytics" />,
		);
		expect(screen.getByText("Analytics")).toBeDefined();
		expect(
			container.querySelector('[data-testid="web-skeleton"]'),
		).toBeDefined();
	});
});

describe("StudioFrame", () => {
	afterEach(() => cleanup());

	it("never mounts executable generated content in the application canvas", () => {
		const onSelect = vi.fn();
		const { container } = render(
			<StudioFrame
				frame={{
					id: "f-1",
					projectId: "p-1",
					name: "Dashboard",
					description: "Main screen",
					viewport: "mobile",
					htmlCode: "<html><body><h1>Dashboard Content</h1></body></html>",
					status: "ready",
					order: 0,
					error: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				}}
				isSelected={false}
				onSelect={onSelect}
				isCanvasPanning={false}
			/>,
		);

		expect(screen.getByText("Dashboard")).toBeDefined();
		expect(container.querySelector("iframe")).toBeNull();
		expect(container.querySelector("script")).toBeNull();
	});

	it("renders skeleton while frame is generating", () => {
		render(
			<StudioFrame
				frame={{
					id: "f-2",
					projectId: "p-1",
					name: "Transactions",
					description: "List",
					viewport: "mobile",
					htmlCode: null,
					status: "generating",
					order: 1,
					error: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				}}
				isSelected={false}
				onSelect={vi.fn()}
				isCanvasPanning={false}
			/>,
		);

		expect(screen.getAllByText("Transactions").length).toBeGreaterThanOrEqual(
			1,
		);
		expect(screen.getByText(/Menggenerate/i)).toBeDefined();
	});

	it("triggers onSelect when frame is clicked", () => {
		const onSelect = vi.fn();
		render(
			<StudioFrame
				frame={{
					id: "f-3",
					projectId: "p-1",
					name: "Settings",
					description: "Account",
					viewport: "mobile",
					htmlCode: "<html><body>Settings</body></html>",
					status: "ready",
					order: 2,
					error: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				}}
				isSelected={false}
				onSelect={onSelect}
				isCanvasPanning={false}
			/>,
		);

		const frameHeader = screen.getByText("Settings");
		fireEvent.click(frameHeader);
		expect(onSelect).toHaveBeenCalledWith("f-3");
	});

	it("renders failed state with retry button", () => {
		const onRetry = vi.fn();
		render(
			<StudioFrame
				frame={{
					id: "f-4",
					projectId: "p-1",
					name: "Failed Frame",
					description: "Error",
					viewport: "mobile",
					htmlCode: null,
					status: "failed",
					order: 3,
					error: "AI limit",
					createdAt: new Date(),
					updatedAt: new Date(),
				}}
				isSelected={false}
				onSelect={vi.fn()}
				onRetry={onRetry}
				isCanvasPanning={false}
			/>,
		);

		expect(screen.getAllByText(/Gagal/i).length).toBeGreaterThanOrEqual(1);
		const retryBtn = screen.getAllByRole("button", { name: /Coba lagi/i })[0];
		fireEvent.click(retryBtn);
		expect(onRetry).toHaveBeenCalledWith("f-4");
	});
});
