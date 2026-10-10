// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.fn();
const mockUseLoaderData = vi.fn();
const mockUseSearch = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: Record<string, unknown>) => ({
		...options,
		useLoaderData: () => mockUseLoaderData(),
		useSearch: () => mockUseSearch(),
	}),
	useNavigate: () => mockNavigate,
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
			screen.getByRole("button", { name: /Start with your design/i }),
		).toBeDefined();
		expect(screen.getByRole("button", { name: "Generate UI" })).toBeDefined();
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

		const submitBtn = screen.getByRole("button", { name: "Generate UI" });
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

	it("opens Start with your design modal when clicking secondary action", () => {
		const StudioComponent = (
			Route as unknown as { component: React.ComponentType }
		).component;
		render(<StudioComponent />);

		const modalBtn = screen.getByRole("button", {
			name: /Start with your design/i,
		});
		fireEvent.click(modalBtn);

		expect(
			screen.getByText(
				"Gunakan design system dan identitas visual yang sudah kamu punya sebagai referensi.",
			),
		).toBeDefined();
	});
});
