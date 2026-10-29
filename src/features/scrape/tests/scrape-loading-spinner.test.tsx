// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewCanvasOverlay } from "../components/scrape-detail-preview-overlay";
import { ScrapeErrorCard } from "../components/scrape-error-card";
import { ScrapeWorkspaceForm } from "../components/scrape-workspace-form";

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(async () => {}),
	Link: ({ children }: { children?: import("react").ReactNode }) => children,
}));

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

// Loading02Icon is the project's standard circular spinner. Loading01Icon (the
// hourglass this change replaced) starts its body path with the top triangle.
const HOURGLASS_PREFIX = "M17.2014 2H6.79876";
const CIRCULAR_PREFIX = "M18.001 20C16.3295";

function spinnerPaths(container: HTMLElement): string[] {
	return Array.from(container.querySelectorAll("svg")).map(
		(svg) => svg.querySelector("path")?.getAttribute("d") ?? "",
	);
}

function expectCircularSpinner(container: HTMLElement) {
	const spinning = container.querySelector('[class*="animate-spin"]');
	expect(spinning).not.toBeNull();
	const path = spinning?.querySelector("path")?.getAttribute("d") ?? "";
	expect(path.startsWith(HOURGLASS_PREFIX)).toBe(false);
	expect(path.startsWith(CIRCULAR_PREFIX)).toBe(true);
}

describe("VibeScrape loading spinner standardization", () => {
	it("shows the circular spinner on submit while pending and blocks duplicate submits", async () => {
		const fetchMock = vi.fn(() => new Promise<Response>(() => {}));
		vi.stubGlobal("fetch", fetchMock);
		const { container } = render(<ScrapeWorkspaceForm mode="crawl" />);
		fireEvent.change(screen.getByLabelText(/URL website/i), {
			target: { value: "sample.example" },
		});
		const submit = screen.getByRole("button", {
			name: /Jalankan Crawl Website/i,
		});
		fireEvent.click(submit);

		await waitFor(() => {
			expect(submit.hasAttribute("disabled")).toBe(true);
		});
		expectCircularSpinner(container);

		fireEvent.click(submit);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("uses the same circular spinner while the HTML preview is preparing", () => {
		const { container } = render(<PreviewCanvasOverlay report="preparing" />);
		expectCircularSpinner(container);
		expect(screen.getByText("Menyiapkan preview website")).toBeDefined();
	});

	it("keeps the retry icon static while idle and spins the circular spinner only while retrying", () => {
		const { container, unmount } = render(
			<ScrapeErrorCard
				title="Website membatasi akses"
				guidance="Tunggu sebelum mencoba lagi."
				retryable
				onRetry={vi.fn()}
			/>,
		);
		expect(container.querySelector('[class*="animate-spin"]')).toBeNull();
		expect(spinnerPaths(container)[0]?.startsWith(CIRCULAR_PREFIX)).toBe(false);
		unmount();

		const retrying = render(
			<ScrapeErrorCard
				title="Website membatasi akses"
				guidance="Tunggu sebelum mencoba lagi."
				retryable
				isRetrying
				onRetry={vi.fn()}
			/>,
		);
		expectCircularSpinner(retrying.container);
	});
});
