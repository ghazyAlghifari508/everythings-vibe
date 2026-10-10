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

describe("StudioDetailPage Multi-Screen Canvas", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it("renders multi-screen canvas with mobile project and frames", () => {
		mockUseLoaderData.mockReturnValue({
			project: {
				id: "proj-mob-1",
				title: "Aplikasi POS Kasir",
				designMode: "mobile",
				designMd: "## Tokens",
				logoAssetId: "logo-1",
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			frames: [
				{
					id: "f-1",
					projectId: "proj-mob-1",
					name: "Dashboard",
					description: "Ringkasan",
					viewport: "mobile",
					htmlCode: "<html><body>Dashboard</body></html>",
					status: "ready",
					order: 0,
					error: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
				{
					id: "f-2",
					projectId: "proj-mob-1",
					name: "Transactions",
					description: "Histori",
					viewport: "mobile",
					htmlCode: null,
					status: "generating",
					order: 1,
					error: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			],
			activeJob: {
				id: "j-1",
				status: "generating",
			},
			logoUrl: "/api/studio/asset?id=logo-1",
			revisions: [],
			latest: null,
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

		// Frames are rendered
		expect(screen.getByText("Dashboard")).toBeDefined();
		expect(screen.getAllByText("Transactions").length).toBeGreaterThanOrEqual(1);

		// Floating Composer is present
		expect(
			screen.getByPlaceholderText(/Minta AI menambah halaman atau merevisi UI/i),
		).toBeDefined();
	});

	it("selects a frame and targets it in the floating composer", async () => {
		mockUseLoaderData.mockReturnValue({
			project: {
				id: "proj-1",
				title: "Multi-Screen Web",
				designMode: "web",
				designMd: null,
				logoAssetId: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			frames: [
				{
					id: "f-1",
					projectId: "proj-1",
					name: "Overview",
					description: "Main overview",
					viewport: "web",
					htmlCode: "<html><body>Overview</body></html>",
					status: "ready",
					order: 0,
					error: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			],
			activeJob: null,
			logoUrl: null,
			revisions: [],
			latest: null,
		});

		const Component = (Route as unknown as { component: React.ComponentType })
			.component;
		render(<Component />);

		const frameBtn = screen.getByRole("button", { name: /^Overview$/i });
		fireEvent.click(frameBtn);

		await waitFor(() => {
			expect(screen.getByText(/Editing: Overview/i)).toBeDefined();
		});
	});

	it("submits prompt via floating composer to revise selected frame", async () => {
		mockUseLoaderData.mockReturnValue({
			project: {
				id: "proj-1",
				title: "Project Canvas",
				designMode: "mobile",
				designMd: null,
				logoAssetId: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
			frames: [
				{
					id: "f-1",
					projectId: "proj-1",
					name: "Dashboard",
					description: "Overview",
					viewport: "mobile",
					htmlCode: "<html><body>Dashboard</body></html>",
					status: "ready",
					order: 0,
					error: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			],
			activeJob: null,
			logoUrl: null,
			revisions: [],
			latest: null,
		});

		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				frame: {
					id: "f-1",
					name: "Dashboard",
					status: "ready",
					htmlCode: "<html><body>Revised Dashboard</body></html>",
				},
			}),
		});
		global.fetch = fetchMock;

		const Component = (Route as unknown as { component: React.ComponentType })
			.component;
		render(<Component />);

		// Select frame f-1
		const frameBtn = screen.getByRole("button", { name: /^Dashboard$/i });
		fireEvent.click(frameBtn);

		const input = screen.getByRole("textbox");
		fireEvent.change(input, {
			target: { value: "Ubah tombol jadi warna hitam" },
		});

		const submitBtn = screen.getByRole("button", { name: /Kirim prompt/i });
		fireEvent.click(submitBtn);

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/studio/frame",
				expect.objectContaining({
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						action: "revise",
						projectId: "proj-1",
						frameId: "f-1",
						prompt: "Ubah tombol jadi warna hitam",
					}),
				}),
			);
		});
	});
});
