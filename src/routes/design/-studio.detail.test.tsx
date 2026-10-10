// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseLoaderData = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useLoaderData: () => mockUseLoaderData(),
	}),
	Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => ({
		validator: () => ({
			handler: (fn: unknown) => fn,
		}),
	}),
	createServerOnlyFn: (fn: unknown) => fn,
}));

vi.mock("@/lib/session", () => ({
	requireUserServer: vi.fn(),
}));

import { Route } from "./studio.$id";

describe("StudioDetailPage Viewport & Revisions", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it("renders mobile project with Mobile badge and mobile canvas initial viewport", () => {
		mockUseLoaderData.mockReturnValue({
			id: "proj-mob-1",
			title: "Aplikasi POS Kasir",
			designMode: "mobile",
			hasDesignMd: true,
			hasLogo: true,
			latestHtml: "<html><body>Mobile App Content</body></html>",
			latestVersion: 1,
			revisionCount: 1,
		});

		const Component = (Route as unknown as { component: React.ComponentType })
			.component;
		render(<Component />);

		expect(
			screen.getByRole("heading", { level: 1, name: "Aplikasi POS Kasir" }),
		).toBeDefined();
		expect(screen.getByText("Mobile")).toBeDefined();
		expect(screen.getByText("DESIGN.md")).toBeDefined();
		expect(screen.getByText("Logo")).toBeDefined();

		// Check viewport button state in Canvas
		const mobileViewportBtn = screen.getByRole("button", {
			name: /Mobile 375px/i,
		});
		expect(mobileViewportBtn.getAttribute("aria-pressed")).toBe("true");
	});

	it("renders web project with desktop initial viewport", () => {
		mockUseLoaderData.mockReturnValue({
			id: "proj-web-1",
			title: "Dashboard SIMRS",
			designMode: "web",
			hasDesignMd: false,
			hasLogo: false,
			latestHtml: "<html><body>Web Dashboard Content</body></html>",
			latestVersion: 2,
			revisionCount: 2,
		});

		const Component = (Route as unknown as { component: React.ComponentType })
			.component;
		render(<Component />);

		expect(
			screen.getByRole("heading", { level: 1, name: "Dashboard SIMRS" }),
		).toBeDefined();
		expect(screen.getByText("Web")).toBeDefined();

		const desktopViewportBtn = screen.getByRole("button", {
			name: /Desktop 1440px/i,
		});
		expect(desktopViewportBtn.getAttribute("aria-pressed")).toBe("true");
	});

	it("submits iterative revision and updates displayed version", async () => {
		mockUseLoaderData.mockReturnValue({
			id: "proj-1",
			title: "Project Revisi",
			designMode: "web",
			hasDesignMd: false,
			hasLogo: false,
			latestHtml: "<html><body>v1</body></html>",
			latestVersion: 1,
			revisionCount: 1,
		});

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				htmlCode: "<html><body>v2 with green button</body></html>",
				version: 2,
			}),
		});
		global.fetch = fetchMock;

		const Component = (Route as unknown as { component: React.ComponentType })
			.component;
		render(<Component />);

		const input = screen.getByPlaceholderText(/ubah warna tombol/i);
		fireEvent.change(input, {
			target: { value: "Ubah warna tombol jadi hijau" },
		});

		const submitBtn = screen.getByRole("button", { name: "Kirim revisi" });
		fireEvent.click(submitBtn);

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/studio/generate",
				expect.objectContaining({
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						projectId: "proj-1",
						prompt: "Ubah warna tombol jadi hijau",
					}),
				}),
			);
		});

		await waitFor(() => {
			expect(screen.getByText(/v2 · 1 revisi/i)).toBeDefined();
		});
	});
});
