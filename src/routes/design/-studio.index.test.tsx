// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
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
	createServerFn: () => ({
		handler: (fn: unknown) => fn,
	}),
	createServerOnlyFn: (fn: unknown) => fn,
}));

vi.mock("@/lib/session", () => ({
	requireUserServer: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: null }) },
}));

import { Route } from "./studio.index";

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
		mockUseLoaderData.mockReturnValue({ history: defaultHistory });
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
			screen.getByPlaceholderText(/Jelaskan kebutuhan antarmukamu/i),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: "Tambah referensi desain" }),
		).toBeDefined();
		expect(screen.getByRole("button", { name: "Kirim prompt" })).toBeDefined();
		expect(
			screen.getByRole("button", { name: /Design skill: No Skill/i }),
		).toBeDefined();
		expect(
			screen.getByRole("button", { name: /Jumlah halaman awal: 3/i }),
		).toBeDefined();
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

	it("shows error when submitting empty prompt", () => {
		const StudioComponent = (
			Route as unknown as { component: React.ComponentType }
		).component;
		const { container } = render(<StudioComponent />);

		const form = container.querySelector("form");
		expect(form).not.toBeNull();
		if (form) fireEvent.submit(form);

		expect(
			screen.getByText("Ceritakan UI yang mau dibuat dulu."),
		).toBeDefined();
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

		const textarea = screen.getByPlaceholderText(
			/Jelaskan kebutuhan antarmukamu/i,
		);
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
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						prompt: "Aplikasi mobile fitness tracking dengan kalender",
						designMode: "mobile",
						designSkillId: "none",
						initialPageCount: 3,
						designReference: null,
						designMd: null,
						logo: null,
					}),
				}),
			);
		});

		expect(mockNavigate).toHaveBeenCalledWith({
			to: "/design/studio/$id",
			params: { id: "new-proj-789" },
		});
	});

	it("opens the visual design picker from the composer icon", () => {
		const StudioComponent = (
			Route as unknown as { component: React.ComponentType }
		).component;
		render(<StudioComponent />);

		fireEvent.click(
			screen.getByRole("button", { name: "Tambah referensi desain" }),
		);

		expect(screen.getByText("Pilih tampilan")).toBeDefined();
		expect(screen.getByRole("tab", { name: "Tema" })).toBeDefined();
		expect(screen.getByRole("tab", { name: "Template" })).toBeDefined();
		expect(screen.getByRole("tab", { name: "Punya Saya" })).toBeDefined();
	});

	it("populates an editable brief with platform and page count from a shortcut", () => {
		const StudioComponent = (
			Route as unknown as { component: React.ComponentType }
		).component;
		render(<StudioComponent />);

		fireEvent.click(
			screen.getByRole("button", { name: /Kopi Specialty Ordering/i }),
		);

		const textarea = screen.getByPlaceholderText(
			/Jelaskan kebutuhan antarmukamu/i,
		) as HTMLTextAreaElement;
		expect(textarea.value).toContain("Ruang Seduh");
		expect(
			screen
				.getByRole("button", { name: "Mobile" })
				.getAttribute("aria-pressed"),
		).toBe("true");
		expect(
			screen.getByRole("button", { name: /Jumlah halaman awal: 4/i }),
		).toBeDefined();
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

	it("renders the page-shell header with back control, logo and profile outside the composer column", () => {
		const StudioComponent = (
			Route as unknown as { component: React.ComponentType }
		).component;
		render(<StudioComponent />);

		const banner = screen.getByRole("banner");
		expect(
			within(banner).getByRole("link", { name: /kembali/i }),
		).toBeDefined();
		expect(within(banner).getByText("VibeEverything")).toBeDefined();
		expect(
			within(banner).getByRole("button", { name: "Profil dan tampilan" }),
		).toBeDefined();

		const main = screen.getByRole("main");
		expect(within(main).getByText("What will you design?")).toBeDefined();
		expect(
			within(main).getByRole("region", { name: "Daftar brief siap pakai" }),
		).toBeDefined();
	});

	it("falls back to the design hub for the back control on direct visits", () => {
		const StudioComponent = (
			Route as unknown as { component: React.ComponentType }
		).component;
		render(<StudioComponent />);

		const back = screen.getByRole("link", { name: /kembali/i });
		expect(back.getAttribute("href")).toBe("/design");
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
