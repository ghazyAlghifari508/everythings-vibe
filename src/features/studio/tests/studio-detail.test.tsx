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

vi.mock("@/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: null }) },
}));

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useLoaderData: () => mockUseLoaderData(),
	}),
	Link: ({
		children,
		to,
		...props
	}: {
		children: React.ReactNode;
		to: string;
	}) => (
		<a href={to} {...props}>
			{children}
		</a>
	),
	useNavigate: () => vi.fn(),
	useRouter: () => ({ invalidate: vi.fn(async () => {}) }),
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

import { Route } from "@/routes/design/$id";

describe("StudioDetailPage Multi-Screen Canvas", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	it("renders multi-screen canvas with mobile project and frames", async () => {
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
				projectId: "proj-mob-1",
				userId: "user-1",
				prompt: "Sample",
				jobType: "initial",
				targetFrameId: null,
				status: "generating",
				error: null,
				claimedBy: "worker-1",
				attempts: 1,
				claimedAt: new Date(),
				leaseExpiresAt: new Date(Date.now() + 60_000),
				startedAt: new Date(),
				finishedAt: null,
				createdAt: new Date(),
				updatedAt: new Date(),
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
		expect(screen.getByRole("button", { name: "Menu project" })).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Export project" }),
		).toBeDefined();
		expect(screen.queryByText(/Layar Siap/)).toBeNull();

		// Frames are rendered
		expect(screen.getByText("Dashboard")).toBeDefined();
		expect(screen.getAllByText("Transactions").length).toBeGreaterThanOrEqual(
			1,
		);

		// Floating Composer is present
		expect(screen.getByPlaceholderText(/sebutkan halaman baru/i)).toBeDefined();
		// The simplified composer must not bring back the removed controls.
		expect(screen.queryByText(/Tambah Halaman/i)).toBeNull();
		expect(
			screen.queryByRole("button", { name: /Pilih design system/i }),
		).toBeNull();
		// The project menu keeps navigation, duplication, and deletion without
		// the removed manual add-page or project design-system switcher.
		fireEvent.pointerDown(
			screen.getByRole("button", { name: "Menu project" }),
			{ button: 0, ctrlKey: false, pointerType: "mouse" },
		);
		expect(
			await screen.findByRole("menuitem", {
				name: /Kembali ke Semua Project/i,
			}),
		).toBeDefined();
		expect(
			screen.getByRole("menuitem", { name: /Duplicate Project/i }),
		).toBeDefined();
		expect(
			screen.queryByRole("menuitem", { name: /Design system/i }),
		).toBeNull();
		expect(
			screen.queryByRole("menuitem", { name: /Tambah Halaman/i }),
		).toBeNull();
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
					body: expect.any(String),
				}),
			);
		});
		const operationCall = fetchMock.mock.calls.find(
			(call) => call[1]?.method === "POST",
		);
		const requestBody: unknown = JSON.parse(operationCall?.[1].body);
		expect(requestBody).toMatchObject({
			action: "operation",
			projectId: "proj-1",
			frameIds: ["f-1"],
			prompt: "Ubah tombol jadi warna hitam",
		});
	});

	function frame(id: string, name: string, order: number) {
		return {
			id,
			projectId: "proj-1",
			name,
			description: name,
			viewport: "mobile" as const,
			htmlCode: `<html><body>${name}</body></html>`,
			status: "ready" as const,
			order,
			error: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
	}

	const multiSelectLoader = {
		project: {
			id: "proj-1",
			title: "Multi Select",
			designMode: "mobile",
			designMd: null,
			logoAssetId: null,
			createdAt: new Date(),
			updatedAt: new Date(),
		},
		frames: [
			frame("f-1", "Ringkasan", 0),
			frame("f-2", "Anggaran", 1),
			frame("f-3", "Laporan", 2),
		],
		activeJob: null,
		logoUrl: null,
		revisions: [],
		latest: null,
	};

	it("sends every shift-selected frame id to the revision API", async () => {
		mockUseLoaderData.mockReturnValue(structuredClone(multiSelectLoader));
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ frames: [] }),
		});
		global.fetch = fetchMock;

		const Component = (Route as unknown as { component: React.ComponentType })
			.component;
		render(<Component />);

		fireEvent.click(screen.getByRole("button", { name: /^Ringkasan$/i }));
		fireEvent.click(screen.getByRole("button", { name: /^Anggaran$/i }), {
			shiftKey: true,
		});

		await waitFor(() => {
			expect(screen.getByText(/Merevisi 2 layar terpilih/i)).toBeDefined();
		});

		fireEvent.change(screen.getByRole("textbox"), {
			target: { value: "Samakan hierarki tipografi antar layar" },
		});
		fireEvent.click(screen.getByRole("button", { name: /Kirim prompt/i }));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalled();
		});
		const operationCall = fetchMock.mock.calls.find(
			(call) => call[1]?.method === "POST",
		);
		const requestBody: unknown = JSON.parse(operationCall?.[1].body);
		expect(requestBody).toMatchObject({
			action: "operation",
			frameIds: ["f-1", "f-2"],
		});
	});

	it("keeps multiple selected frames while a status poll replaces frame rows", async () => {
		mockUseLoaderData.mockReturnValue(structuredClone(multiSelectLoader));
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ frames: [] }),
		});

		const Component = (Route as unknown as { component: React.ComponentType })
			.component;
		const { rerender } = render(<Component />);

		fireEvent.click(screen.getByRole("button", { name: /^Ringkasan$/i }));
		fireEvent.click(screen.getByRole("button", { name: /^Laporan$/i }), {
			shiftKey: true,
		});
		await waitFor(() => {
			expect(screen.getByText(/Merevisi 2 layar terpilih/i)).toBeDefined();
		});

		// A poll returns the same frames with fresh row identity and a changed
		// height (a re-measured preview); the id-based selection must survive.
		const polled = structuredClone(multiSelectLoader);
		polled.frames = polled.frames.map((entry) => ({
			...entry,
			updatedAt: new Date(),
		}));
		mockUseLoaderData.mockReturnValue(polled);
		rerender(<Component />);

		expect(screen.getByText(/Merevisi 2 layar terpilih/i)).toBeDefined();
		expect(screen.getAllByText("Ringkasan").length).toBeGreaterThanOrEqual(1);
		expect(screen.getAllByText("Laporan").length).toBeGreaterThanOrEqual(1);
	});

	it("removes a single frame through the composer without dropping the rest", async () => {
		mockUseLoaderData.mockReturnValue(structuredClone(multiSelectLoader));
		global.fetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ frames: [] }),
		});

		const Component = (Route as unknown as { component: React.ComponentType })
			.component;
		render(<Component />);

		fireEvent.click(screen.getByRole("button", { name: /^Ringkasan$/i }));
		fireEvent.click(screen.getByRole("button", { name: /^Anggaran$/i }), {
			shiftKey: true,
		});
		await waitFor(() => {
			expect(screen.getByText(/Merevisi 2 layar terpilih/i)).toBeDefined();
		});

		fireEvent.click(screen.getByRole("button", { name: /Lepas Ringkasan/i }));
		await waitFor(() => {
			expect(screen.getByText(/Editing: Anggaran/i)).toBeDefined();
		});
	});
});
