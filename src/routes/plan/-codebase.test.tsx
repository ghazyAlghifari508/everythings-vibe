// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useUIStore } from "@/store";
import { PlanCodebasePage } from "./codebase";

const mockNavigate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
	useNavigate: () => mockNavigate,
	Link: ({
		children,
		to,
		className,
	}: {
		children: React.ReactNode;
		to: string;
		className?: string;
	}) => (
		<a href={to} className={className}>
			{children}
		</a>
	),
}));

describe("PlanCodebasePage Loading Spinner & Flow Contract", () => {
	beforeEach(() => {
		useUIStore.getState().setCodebasePlanStep("prompt");
		mockNavigate.mockReset();
	});

	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
	});

	it("renders vertically and horizontally centered loading spinner before prompt sync arrives", () => {
		// Mock fetch that hangs to inspect the initial loading state
		vi.stubGlobal(
			"fetch",
			vi.fn(() => new Promise(() => {})),
		);

		const { container } = render(<PlanCodebasePage />);

		// Spinner and text exist
		expect(screen.getByText("Menyiapkan sesi sync...")).toBeDefined();
		expect(
			screen.getByText(
				"Menghubungkan repository dan menginisialisasi instruksi CLI",
			),
		).toBeDefined();

		// Check centering layout classes on container
		const centeringWrapper = container.querySelector(
			".flex.flex-1.items-center.justify-center.min-h-\\[50vh\\]",
		);
		expect(centeringWrapper).not.toBeNull();

		// Check the spinner element itself
		const spinner = container.querySelector(".animate-spin");
		expect(spinner).not.toBeNull();
		expect(spinner?.classList.contains("border-t-indigo")).toBe(true);
	});

	it("transitions to ScreenConnect prompt sync once codebase session is created", async () => {
		const mockSyncPayload = {
			projectId: "cb-123",
			apiBaseUrl: "http://localhost:3000",
			syncToken: "test-token-abc",
			syncCommand:
				"vibeeverything codebase sync --project-id cb-123 --token test-token-abc",
			expiresAt: new Date(Date.now() + 3600000).toISOString(),
		};

		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
				json: async () => ({
					id: "cb-123",
					name: "my-existing-app",
					sync: mockSyncPayload,
				}),
			}),
		);

		render(<PlanCodebasePage />);

		// Wait for ScreenConnect to mount
		await waitFor(() => {
			expect(
				screen.getByText("Sync codebase dengan VibeEverything"),
			).toBeDefined();
		});

		// Loading spinner wrapper is no longer in the DOM
		expect(screen.queryByText("Menyiapkan sesi sync...")).toBeNull();
	});

	it("displays error banner and retry button if codebase creation fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockRejectedValue(new Error("Network connection lost")),
		);

		render(<PlanCodebasePage />);

		await waitFor(() => {
			expect(screen.getByText("Server tidak dapat dihubungi.")).toBeDefined();
		});

		expect(screen.getByRole("button", { name: "Coba lagi" })).toBeDefined();
	});
});
