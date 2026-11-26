// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	cleanup,
	fireEvent,
	render as renderBase,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
const mockUseLoaderData = vi.fn();
const mockUseSearch = vi.fn();
const mockInvalidate = vi.fn(async () => {});

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useLoaderData: () => mockUseLoaderData(),
		useSearch: () => mockUseSearch(),
	}),
	useNavigate: () => mockNavigate,
	useRouter: () => ({ invalidate: mockInvalidate }),
	Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
		<a href={to}>{children}</a>
	),
}));

vi.mock("@tanstack/react-start", () => ({
	createServerFn: () => {
		// Server functions chain .validator(...) before .handler(...).
		const builder = {
			validator: () => builder,
			handler: (fn: unknown) => fn,
		};
		return builder;
	},
	createServerOnlyFn: (fn: unknown) => fn,
}));

vi.mock("@/lib/session", () => ({
	requireUserServer: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: null }) },
}));

import { Route } from "@/routes/design/index";

const queryClient = new QueryClient({
	defaultOptions: { queries: { retry: false } },
});

// The Studio workspace reads plan state through react-query, so every render
// and rerender keeps the provider mounted.
function render(ui: React.ReactElement) {
	const view = renderBase(
		<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
	);
	return {
		...view,
		rerender: (next: React.ReactElement) =>
			view.rerender(
				<QueryClientProvider client={queryClient}>{next}</QueryClientProvider>,
			),
	};
}

describe("StudioPage UI & Workflow", () => {
	const defaultHistory = [
		{
			id: "proj-1",
			title: "SIMRS Dashboard",
			designMode: "web",
			hasDesignMd: false,
			hasLogo: false,
			createdAt: "2026-03-01T00:00:00Z",
		},
		{
			id: "proj-2",
			title: "Mobile POS",
			designMode: "mobile",
			hasDesignMd: true,
			hasLogo: true,
			createdAt: "2026-03-02T00:00:00Z",
		},
	];

	beforeEach(() => {
		vi.clearAllMocks();
		mockNavigate.mockReset();
		mockUseLoaderData.mockReturnValue({
			history: defaultHistory,
			scrapeSources: [
				{
					id: "scrape-1",
					title: "Tokopedia",
					domain: "tokopedia.com",
					sourceUrl: "https://tokopedia.com",
				},
			],
		});
		mockUseSearch.mockReturnValue({});
	});

	afterEach(() => {
		cleanup();
	});

	it("renders main workspace with Stitch-inspired layout and composer", () => {
		const StudioComponent = (
			Route as unknown as { component: React.ComponentType }
		).component;
		render(<StudioComponent />);

		expect(screen.getByText("What will you design?")).toBeDefined();
		expect(
			screen.getByRole("textbox", { name: "Prompt Desain UI" }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Pilih tampilan" }),
		).toBeDefined();
		expect(screen.getByRole("button", { name: "Kirim prompt" })).toBeDefined();
		expect(
			screen.queryByRole("button", { name: /Jumlah halaman awal/i }),
		).toBeNull();
		expect(screen.getByText("Mulai dari brief siap pakai")).toBeDefined();
	});

	it("allows switching between Web and Mobile design modes", () => {
		const StudioComponent = (
			Route as unknown as { component: React.ComponentType }
		).component;
		render(<StudioComponent />);

		const webBtn = screen.getByRole("button", { name: "Web" });
		const mobileBtn = screen.getByRole("button", { name: "Mobile" });

		// Default is web
		expect(webBtn.getAttribute("aria-pressed")).toBe("true");
		expect(mobileBtn.getAttribute("aria-pressed")).toBe("false");

		// Click Mobile
		fireEvent.click(mobileBtn);
		expect(webBtn.getAttribute("aria-pressed")).toBe("false");
		expect(mobileBtn.getAttribute("aria-pressed")).toBe("true");
	});

	it("does not submit an empty prompt", () => {
		const StudioComponent = (
			Route as unknown as { component: React.ComponentType }
		).component;
		render(<StudioComponent />);
		const submit = screen.getByRole("button", { name: "Kirim prompt" });
		expect(submit).toHaveProperty("disabled", true);
		fireEvent.keyDown(
			screen.getByRole("textbox", { name: "Prompt Desain UI" }),
			{ key: "Enter" },
		);
		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("submits generation with selected designMode and navigates to project on success", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				projectId: "new-proj-789",
				version: 1,
				htmlCode: "<html></html>",
			}),
		});
		global.fetch = fetchMock;

		const StudioComponent = (
			Route as unknown as { component: React.ComponentType }
		).component;
		render(<StudioComponent />);

		const textarea = screen.getByRole("textbox", {
			name: "Prompt Desain UI",
		});
		fireEvent.change(textarea, {
			target: { value: "Aplikasi mobile fitness tracking dengan kalender" },
		});

		// Switch to mobile
		const mobileBtn = screen.getByRole("button", { name: "Mobile" });
		fireEvent.click(mobileBtn);

		const submitBtn = screen.getByRole("button", { name: "Kirim prompt" });
		fireEvent.click(submitBtn);

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/studio/generate",
				expect.objectContaining({
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"Idempotency-Key": expect.stringMatching(/^[a-f0-9-]{36}$/),
					},
					body: JSON.stringify({
						prompt: "Aplikasi mobile fitness tracking dengan kalender",
						designMode: "mobile",
						designReference: null,
						designMd: null,
						prdAttachment: null,
						logo: null,
					}),
				}),
			);
		});

		expect(mockNavigate).toHaveBeenCalledWith({
			to: "/design/$id",
			params: { id: "new-proj-789" },
		});
	});

	it("opens the visual design picker from the composer icon", () => {
		const StudioComponent = (
			Route as unknown as { component: React.ComponentType }
		).component;
		render(<StudioComponent />);

		fireEvent.click(screen.getByRole("button", { name: "Pilih tampilan" }));

		expect(screen.getByText("Pilih tampilan")).toBeDefined();
		expect(screen.getByRole("tab", { name: "Tema" })).toBeDefined();
		expect(screen.getByRole("tab", { name: "Template" })).toBeDefined();
		expect(screen.getByRole("tab", { name: "Punya Saya" })).toBeDefined();
	});

	it("populates an editable brief and platform without selecting a page count", () => {
		const StudioComponent = (
			Route as unknown as { component: React.ComponentType }
		).component;
		render(<StudioComponent />);

		fireEvent.click(
			screen.getByRole("button", { name: /Kopi Specialty Ordering/i }),
		);

		const textarea = screen.getByRole("textbox", {
			name: "Prompt Desain UI",
		}) as HTMLTextAreaElement;
		expect(textarea.value).toContain("Ruang Seduh");
		expect(
			screen
				.getByRole("button", { name: "Mobile" })
				.getAttribute("aria-pressed"),
		).toBe("true");
		expect(
			screen.queryByRole("button", { name: /Jumlah halaman awal/i }),
		).toBeNull();
	});

	it("deletes a history project through the server action and revalidates the loader", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({ deletedProjectId: "proj-1" }),
		});
		global.fetch = fetchMock;

		const StudioComponent = (
			Route as unknown as { component: React.ComponentType }
		).component;
		render(<StudioComponent />);

		fireEvent.pointerDown(
			screen.getByRole("button", { name: "Aksi project SIMRS Dashboard" }),
			{ button: 0, ctrlKey: false, pointerType: "mouse" },
		);
		fireEvent.click(
			await screen.findByRole("menuitem", { name: /Hapus project/i }),
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "Hapus project" }),
		);

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				"/api/studio/project",
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({ action: "delete", projectId: "proj-1" }),
				}),
			);
		});
		// The list reconciles from authoritative loader data, not a page reload.
		await waitFor(() => expect(mockInvalidate).toHaveBeenCalled());
		expect(mockNavigate).not.toHaveBeenCalled();
	});

	it("surfaces a retryable error and keeps the project when deletion fails", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			json: async () => ({ error: "Gagal menghapus project. Coba lagi." }),
		});
		global.fetch = fetchMock;

		const StudioComponent = (
			Route as unknown as { component: React.ComponentType }
		).component;
		render(<StudioComponent />);

		fireEvent.pointerDown(
			screen.getByRole("button", { name: "Aksi project SIMRS Dashboard" }),
			{ button: 0, ctrlKey: false, pointerType: "mouse" },
		);
		fireEvent.click(
			await screen.findByRole("menuitem", { name: /Hapus project/i }),
		);
		fireEvent.click(
			await screen.findByRole("button", { name: "Hapus project" }),
		);

		await waitFor(() =>
			expect(screen.getByRole("alert").textContent).toContain(
				"Gagal menghapus project. Coba lagi.",
			),
		);
		expect(mockInvalidate).not.toHaveBeenCalled();
		expect(screen.getByText("SIMRS Dashboard")).toBeDefined();
	});

	it("renders the page-shell header with logo and profile without an adjacent back button", () => {
		const StudioComponent = (
			Route as unknown as { component: React.ComponentType }
		).component;
		render(<StudioComponent />);

		const banner = screen.getByRole("banner");
		expect(within(banner).queryByRole("link", { name: /kembali/i })).toBeNull();
		expect(within(banner).getByText("everythings-vibe")).toBeDefined();
		expect(
			within(banner).getByRole("button", { name: "Profil dan tampilan" }),
		).toBeDefined();

		const main = screen.getByRole("main");
		expect(within(main).getByText("What will you design?")).toBeDefined();
		expect(
			within(main).getByRole("region", { name: "Daftar brief siap pakai" }),
		).toBeDefined();
	});

	it("renders the breadcrumb above the main heading linking to home and marking VibeDesign as current", () => {
		const StudioComponent = (
			Route as unknown as { component: React.ComponentType }
		).component;
		render(<StudioComponent />);

		const main = screen.getByRole("main");
		const breadcrumb = within(main).getByRole("navigation", {
			name: "Breadcrumb",
		});
		expect(breadcrumb).toBeDefined();

		const homeLink = within(breadcrumb).getByRole("link", { name: "Home" });
		expect(homeLink.getAttribute("href")).toBe("/");

		const currentItem = within(breadcrumb).getByText("VibeDesign");
		expect(currentItem.getAttribute("aria-current")).toBe("page");

		const heading = within(main).getByRole("heading", {
			name: "What will you design?",
		});
		expect(
			breadcrumb.compareDocumentPosition(heading) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	it("renders all shortcuts in one horizontal carousel with arrow controls", () => {
		const StudioComponent = (
			Route as unknown as { component: React.ComponentType }
		).component;
		render(<StudioComponent />);

		const carousel = screen.getByRole("region", {
			name: "Daftar brief siap pakai",
		});
		expect(
			screen.getByRole("button", { name: "Brief sebelumnya" }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Brief berikutnya" }),
		).toBeDefined();
		expect(within(carousel).getAllByRole("listitem")).toHaveLength(5);
	});

	it("marks the applied brief as selected without submitting a generation", () => {
		const fetchMock = vi.fn();
		global.fetch = fetchMock;

		const StudioComponent = (
			Route as unknown as { component: React.ComponentType }
		).component;
		render(<StudioComponent />);

		fireEvent.click(
			screen.getByRole("button", { name: /Kopi Specialty Ordering/i }),
		);

		expect(
			screen
				.getByRole("button", { name: /Kopi Specialty Ordering/i })
				.getAttribute("aria-pressed"),
		).toBe("true");
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
