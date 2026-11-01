// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrapeWorkspaceForm } from "../components/scrape-workspace-form";
import { ADVANCED_PARAMETER_GROUPS } from "../types/parameter-spec";

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(async () => {}),
}));

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function expandAdvancedParameters(): void {
	const trigger = screen.getByRole("button", { name: /parameter lanjutan/i });
	if (trigger.getAttribute("aria-expanded") === "false") {
		fireEvent.click(trigger);
	}
}

describe("Crawl Depth Helper Copywriting", () => {
	it("uses the non-misleading general explanation in parameter spec", () => {
		const crawlGroup = ADVANCED_PARAMETER_GROUPS.crawl[0];
		const maxDepthSpec = crawlGroup?.numbers.find(
			(spec) => spec.key === "maxDepth",
		);
		expect(maxDepthSpec).toBeDefined();
		expect(maxDepthSpec?.helper).toBe(
			"Atur seberapa jauh crawler mengikuti tautan dari halaman awal.",
		);
		expect(maxDepthSpec?.helper).not.toMatch(/0 hanya mengambil/i);
	});

	it("renders the neutral helper text in the UI", () => {
		render(<ScrapeWorkspaceForm mode="crawl" />);
		expandAdvancedParameters();
		expect(
			screen.getByText(
				"Atur seberapa jauh crawler mengikuti tautan dari halaman awal.",
			),
		).toBeDefined();
		expect(screen.queryByText(/0 hanya mengambil/i)).toBeNull();
	});

	it("helper does not change or mislead when user sets depth to 3", () => {
		render(<ScrapeWorkspaceForm mode="crawl" />);
		expandAdvancedParameters();
		const depth = screen.getByLabelText(/kedalaman penelusuran/i);
		fireEvent.change(depth, { target: { value: "3" } });
		expect(
			screen.getByText(
				"Atur seberapa jauh crawler mengikuti tautan dari halaman awal.",
			),
		).toBeDefined();
		expect(screen.queryByText(/0 hanya mengambil/i)).toBeNull();
	});
});

describe("Crawl Depth Numeric Input Behavior & Validation", () => {
	it("preserves empty temporary input without coercing to 0", () => {
		render(<ScrapeWorkspaceForm mode="crawl" />);
		expandAdvancedParameters();
		const depth = screen.getByLabelText<HTMLInputElement>(
			/kedalaman penelusuran/i,
		);
		fireEvent.change(depth, { target: { value: "" } });
		expect(depth.value).toBe("");
		expect(depth.getAttribute("aria-invalid")).toBe("true");
		expect(screen.getByRole("alert").textContent).toMatch(
			/harus berupa angka/i,
		);
	});

	it("accepts 0 as a valid depth value and displays it correctly", () => {
		render(<ScrapeWorkspaceForm mode="crawl" />);
		expandAdvancedParameters();
		const depth = screen.getByLabelText<HTMLInputElement>(
			/kedalaman penelusuran/i,
		);
		fireEvent.change(depth, { target: { value: "0" } });
		expect(depth.value).toBe("0");
		expect(depth.getAttribute("aria-invalid")).toBeNull();
		expect(screen.queryByRole("alert")).toBeNull();
		expect(
			screen.getByText(
				"Atur seberapa jauh crawler mengikuti tautan dari halaman awal.",
			),
		).toBeDefined();
	});

	it("accepts 1, 2, and 3 without validation issues", () => {
		render(<ScrapeWorkspaceForm mode="crawl" />);
		expandAdvancedParameters();
		const depth = screen.getByLabelText<HTMLInputElement>(
			/kedalaman penelusuran/i,
		);

		for (const val of ["1", "2", "3"]) {
			fireEvent.change(depth, { target: { value: val } });
			expect(depth.value).toBe(val);
			expect(depth.getAttribute("aria-invalid")).toBeNull();
			expect(screen.queryByRole("alert")).toBeNull();
		}
	});

	it("accepts minimum (0) and maximum (5) contract bounds", () => {
		render(<ScrapeWorkspaceForm mode="crawl" />);
		expandAdvancedParameters();
		const depth = screen.getByLabelText<HTMLInputElement>(
			/kedalaman penelusuran/i,
		);

		fireEvent.change(depth, { target: { value: "0" } });
		expect(depth.getAttribute("aria-invalid")).toBeNull();

		fireEvent.change(depth, { target: { value: "5" } });
		expect(depth.getAttribute("aria-invalid")).toBeNull();
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("rejects negative depth values with an actionable range error", () => {
		render(<ScrapeWorkspaceForm mode="crawl" />);
		expandAdvancedParameters();
		const depth = screen.getByLabelText<HTMLInputElement>(
			/kedalaman penelusuran/i,
		);
		fireEvent.change(depth, { target: { value: "-1" } });
		expect(depth.getAttribute("aria-invalid")).toBe("true");
		expect(screen.getByRole("alert").textContent).toMatch(
			/antara 0 dan 5 level/i,
		);
	});

	it("rejects values exceeding maximum depth (5)", () => {
		render(<ScrapeWorkspaceForm mode="crawl" />);
		expandAdvancedParameters();
		const depth = screen.getByLabelText<HTMLInputElement>(
			/kedalaman penelusuran/i,
		);
		fireEvent.change(depth, { target: { value: "6" } });
		expect(depth.getAttribute("aria-invalid")).toBe("true");
		expect(screen.getByRole("alert").textContent).toMatch(
			/antara 0 dan 5 level/i,
		);
	});

	it("rejects decimal values for depth", () => {
		render(<ScrapeWorkspaceForm mode="crawl" />);
		expandAdvancedParameters();
		const depth = screen.getByLabelText<HTMLInputElement>(
			/kedalaman penelusuran/i,
		);
		fireEvent.change(depth, { target: { value: "2.5" } });
		expect(depth.getAttribute("aria-invalid")).toBe("true");
		expect(screen.getByRole("alert").textContent).toMatch(/angka bulat/i);
	});

	it("blocks form submission when crawl depth is empty or invalid", async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		render(<ScrapeWorkspaceForm mode="crawl" />);
		expandAdvancedParameters();
		fireEvent.change(screen.getByLabelText(/URL website/i), {
			target: { value: "example.com" },
		});
		const depth = screen.getByLabelText<HTMLInputElement>(
			/kedalaman penelusuran/i,
		);
		fireEvent.change(depth, { target: { value: "" } });

		fireEvent.click(screen.getByRole("button", { name: /crawl website/i }));
		expect(fetchMock).not.toHaveBeenCalled();
		expect(screen.getByText(/periksa kembali parameter/i)).toBeDefined();

		vi.unstubAllGlobals();
	});

	it("clears stale form submission error when user edits numeric input", async () => {
		render(<ScrapeWorkspaceForm mode="crawl" />);
		expandAdvancedParameters();
		fireEvent.change(screen.getByLabelText(/URL website/i), {
			target: { value: "example.com" },
		});
		const depth = screen.getByLabelText<HTMLInputElement>(
			/kedalaman penelusuran/i,
		);
		fireEvent.change(depth, { target: { value: "" } });
		fireEvent.click(screen.getByRole("button", { name: /crawl website/i }));
		expect(screen.getByText(/periksa kembali parameter/i)).toBeDefined();

		fireEvent.change(depth, { target: { value: "3" } });
		expect(screen.queryByText(/periksa kembali parameter/i)).toBeNull();
	});

	it("submits maxDepth as 3 when user enters 3", async () => {
		let submittedBody: Record<string, unknown> | null = null;
		vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
			submittedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
			return Response.json({ scrapeId: "scrape-123" });
		});

		render(<ScrapeWorkspaceForm mode="crawl" />);
		expandAdvancedParameters();
		fireEvent.change(screen.getByLabelText(/URL website/i), {
			target: { value: "example.com" },
		});
		const depth = screen.getByLabelText<HTMLInputElement>(
			/kedalaman penelusuran/i,
		);
		fireEvent.change(depth, { target: { value: "3" } });

		fireEvent.click(screen.getByRole("button", { name: /crawl website/i }));

		await waitFor(() => {
			expect(submittedBody).not.toBeNull();
			expect(submittedBody).toMatchObject({
				mode: "crawl",
				settings: {
					maxDepth: 3,
				},
			});
		});

		vi.unstubAllGlobals();
	});

	it("submits maxDepth as 0 when user enters 0", async () => {
		let submittedBody: Record<string, unknown> | null = null;
		vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
			submittedBody = JSON.parse(String(init.body)) as Record<string, unknown>;
			return Response.json({ scrapeId: "scrape-456" });
		});

		render(<ScrapeWorkspaceForm mode="crawl" />);
		expandAdvancedParameters();
		fireEvent.change(screen.getByLabelText(/URL website/i), {
			target: { value: "example.com" },
		});
		const depth = screen.getByLabelText<HTMLInputElement>(
			/kedalaman penelusuran/i,
		);
		fireEvent.change(depth, { target: { value: "0" } });

		fireEvent.click(screen.getByRole("button", { name: /crawl website/i }));

		await waitFor(() => {
			expect(submittedBody).not.toBeNull();
			expect(submittedBody).toMatchObject({
				mode: "crawl",
				settings: {
					maxDepth: 0,
				},
			});
		});

		vi.unstubAllGlobals();
	});

	it("maintains accessibility associations between label, input, and description", () => {
		render(<ScrapeWorkspaceForm mode="crawl" />);
		expandAdvancedParameters();
		const depth = screen.getByLabelText<HTMLInputElement>(
			/kedalaman penelusuran/i,
		);
		const inputId = depth.getAttribute("id");
		expect(inputId).toBeTruthy();

		// Initially valid, aria-describedby points to helper
		const helperId = depth.getAttribute("aria-describedby");
		expect(helperId).toBe(`${inputId}-helper`);
		const helperEl = document.getElementById(helperId ?? "");
		expect(helperEl?.textContent).toBe(
			"Atur seberapa jauh crawler mengikuti tautan dari halaman awal.",
		);

		// Invalid: aria-describedby points to error
		fireEvent.change(depth, { target: { value: "99" } });
		const errorId = depth.getAttribute("aria-describedby");
		expect(errorId).toBe(`${inputId}-error`);
		const errorEl = document.getElementById(errorId ?? "");
		expect(errorEl?.getAttribute("role")).toBe("alert");
	});
});
