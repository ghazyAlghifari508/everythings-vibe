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

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(async () => {}),
}));

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function advancedTrigger(): HTMLElement {
	return screen.getByRole("button", { name: /parameter lanjutan/i });
}

describe("advanced parameters disclosure", () => {
	it("starts collapsed and exposes a real expand affordance", () => {
		render(<ScrapeWorkspaceForm mode="crawl" />);
		const trigger = advancedTrigger();
		expect(trigger.getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByLabelText(/maksimum halaman/i)).toBeNull();
		expect(screen.queryByText(/cakupan penelusuran/i)).toBeNull();
	});

	it("expands and collapses with a labelled panel", () => {
		render(<ScrapeWorkspaceForm mode="crawl" />);
		fireEvent.click(advancedTrigger());
		expect(advancedTrigger().getAttribute("aria-expanded")).toBe("true");
		expect(screen.getByText(/cakupan penelusuran/i)).toBeDefined();
		expect(screen.getByLabelText(/maksimum halaman/i)).toBeDefined();
		fireEvent.click(advancedTrigger());
		expect(advancedTrigger().getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByLabelText(/maksimum halaman/i)).toBeNull();
	});

	it("submits selected design settings and resets defaults without losing the URL", async () => {
		let submitted: unknown;
		vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
			submitted = JSON.parse(String(init.body));
			return Response.json({ scrapeId: "sample" });
		});
		render(<ScrapeWorkspaceForm mode="design" />);
		fireEvent.click(advancedTrigger());
		fireEvent.change(screen.getByLabelText(/URL website/i), {
			target: { value: "sample.example" },
		});
		fireEvent.change(screen.getByLabelText("Tampilan yang dianalisis"), {
			target: { value: "both" },
		});
		fireEvent.change(screen.getByLabelText("Tema"), {
			target: { value: "both" },
		});
		fireEvent.change(screen.getByLabelText("Kedalaman analisis"), {
			target: { value: "detailed" },
		});
		fireEvent.change(screen.getByLabelText("Fokus analisis"), {
			target: { value: "components" },
		});
		fireEvent.change(screen.getByLabelText("Format panduan kode"), {
			target: { value: "css" },
		});
		fireEvent.click(screen.getByRole("button", { name: /jalankan generate/i }));
		await waitFor(() =>
			expect(submitted).toMatchObject({
				mode: "design",
				settings: {
					viewport: "both",
					theme: "both",
					depth: "detailed",
					focus: "components",
					codeReference: "css",
				},
			}),
		);
		await waitFor(() =>
			expect(
				screen.getByRole<HTMLButtonElement>("button", {
					name: /kembalikan ke pengaturan awal/i,
				}).disabled,
			).toBe(false),
		);
		fireEvent.click(
			screen.getByRole("button", { name: /kembalikan ke pengaturan awal/i }),
		);
		expect(
			screen.getByLabelText<HTMLSelectElement>("Tampilan yang dianalisis")
				.value,
		).toBe("desktop");
		expect(screen.getByLabelText<HTMLInputElement>(/URL website/i).value).toBe(
			"sample.example",
		);
		vi.unstubAllGlobals();
	});

	it("shows only the active mode's settings", () => {
		const { unmount } = render(<ScrapeWorkspaceForm mode="crawl" />);
		fireEvent.click(advancedTrigger());
		expect(screen.getByLabelText(/kedalaman penelusuran/i)).toBeDefined();
		expect(screen.queryByLabelText(/ukur resolusi gambar/i)).toBeNull();
		expect(screen.queryByLabelText(/waktu tunggu tambahan/i)).toBeNull();
		unmount();

		render(<ScrapeWorkspaceForm mode="images" />);
		fireEvent.click(advancedTrigger());
		expect(screen.getByLabelText(/ukur resolusi gambar/i)).toBeDefined();
		expect(screen.getByLabelText(/identifikasi jenis gambar/i)).toBeDefined();
		expect(screen.queryByLabelText(/kedalaman penelusuran/i)).toBeNull();
	});

	it("uses plain Indonesian labels with real helper text and units", () => {
		render(<ScrapeWorkspaceForm mode="crawl" />);
		fireEvent.click(advancedTrigger());
		expect(screen.queryByText(/max pages/i)).toBeNull();
		expect(screen.queryByText(/max depth/i)).toBeNull();
		const pages = screen.getByLabelText(/maksimum halaman/i);
		expect(pages.getAttribute("min")).toBe("1");
		expect(pages.getAttribute("max")).toBe("50");
		expect(pages.getAttribute("aria-describedby")).toBeTruthy();
	});

	it("names the image settings the way the task requires", () => {
		render(<ScrapeWorkspaceForm mode="images" />);
		fireEvent.click(advancedTrigger());
		expect(screen.getByText(/ukur resolusi gambar/i)).toBeDefined();
		expect(screen.getByText(/identifikasi jenis gambar/i)).toBeDefined();
		expect(screen.queryByText(/measure resolution/i)).toBeNull();
		expect(screen.queryByText(/classify type/i)).toBeNull();
	});

	it("collapses again when the scrape mode changes", () => {
		const { rerender } = render(<ScrapeWorkspaceForm mode="crawl" />);
		fireEvent.click(advancedTrigger());
		expect(advancedTrigger().getAttribute("aria-expanded")).toBe("true");
		rerender(<ScrapeWorkspaceForm mode="html" />);
		expect(advancedTrigger().getAttribute("aria-expanded")).toBe("false");
		expect(screen.queryByLabelText(/waktu tunggu tambahan/i)).toBeNull();
	});

	it("shows the wait setting in milliseconds with its unit", () => {
		render(<ScrapeWorkspaceForm mode="html" />);
		fireEvent.click(advancedTrigger());
		expect(screen.getByText(/waktu tunggu tambahan/i)).toBeDefined();
		expect(screen.getByText(/milidetik/i)).toBeDefined();
		expect(screen.queryByText(/wait for/i)).toBeNull();
	});
});

describe("advanced parameter validation", () => {
	it("flags a cleared numeric input with an actionable message", () => {
		render(<ScrapeWorkspaceForm mode="crawl" />);
		fireEvent.click(advancedTrigger());
		const pages = screen.getByLabelText(/maksimum halaman/i);
		fireEvent.change(pages, { target: { value: "" } });
		expect(pages.getAttribute("aria-invalid")).toBe("true");
		expect(screen.getByRole("alert").textContent).toMatch(/angka/i);
	});

	it("names the real bound when a value is out of range", () => {
		render(<ScrapeWorkspaceForm mode="crawl" />);
		fireEvent.click(advancedTrigger());
		const depth = screen.getByLabelText(/kedalaman penelusuran/i);
		fireEvent.change(depth, { target: { value: "99" } });
		expect(depth.getAttribute("aria-invalid")).toBe("true");
		expect(screen.getByRole("alert").textContent).toMatch(/antara 0 dan 5/i);
	});

	it("clears the error once the value is valid again", () => {
		render(<ScrapeWorkspaceForm mode="crawl" />);
		fireEvent.click(advancedTrigger());
		const depth = screen.getByLabelText(/kedalaman penelusuran/i);
		fireEvent.change(depth, { target: { value: "99" } });
		expect(screen.queryByRole("alert")).not.toBeNull();
		fireEvent.change(depth, { target: { value: "2" } });
		expect(screen.queryByRole("alert")).toBeNull();
		expect(depth.getAttribute("aria-invalid")).toBeNull();
	});
});

describe("reset parameters", () => {
	it("restores the defaults for the active mode", () => {
		render(<ScrapeWorkspaceForm mode="crawl" />);
		fireEvent.click(advancedTrigger());
		const pages = screen.getByLabelText<HTMLInputElement>(/maksimum halaman/i);
		const depth = screen.getByLabelText<HTMLInputElement>(
			/kedalaman penelusuran/i,
		);
		fireEvent.change(pages, { target: { value: "3" } });
		fireEvent.change(depth, { target: { value: "4" } });
		expect(pages.value).toBe("3");
		expect(depth.value).toBe("4");

		fireEvent.click(
			screen.getByRole("button", { name: /kembalikan ke pengaturan awal/i }),
		);
		expect(pages.value).toBe("10");
		expect(depth.value).toBe("2");
	});

	it("restores toggles without disturbing the chosen mode", () => {
		render(<ScrapeWorkspaceForm mode="images" />);
		fireEvent.click(advancedTrigger());
		const measure =
			screen.getByLabelText<HTMLInputElement>(/ukur resolusi gambar/i);
		expect(measure.checked).toBe(true);
		fireEvent.click(measure);
		expect(measure.checked).toBe(false);
		fireEvent.click(
			screen.getByRole("button", { name: /kembalikan ke pengaturan awal/i }),
		);
		expect(
			screen.getByLabelText<HTMLInputElement>(/ukur resolusi gambar/i).checked,
		).toBe(true);
	});

	it("leaves the URL untouched when parameters are reset", () => {
		render(<ScrapeWorkspaceForm mode="crawl" />);
		const url = screen.getByLabelText<HTMLInputElement>(/URL website/i);
		fireEvent.change(url, { target: { value: "example.com" } });
		fireEvent.click(advancedTrigger());
		fireEvent.click(
			screen.getByRole("button", { name: /kembalikan ke pengaturan awal/i }),
		);
		expect(url.value).toBe("example.com");
	});
});

describe("warning and url composition", () => {
	it("renders the notice before the url input in a single integrated area", () => {
		const { container } = render(<ScrapeWorkspaceForm mode="crawl" />);
		const notice = screen.getByText("Tidak semua website dapat di-scrape");
		const url = screen.getByLabelText(/URL website/i);
		const form = container.querySelector("form");
		expect(form?.contains(notice)).toBe(true);
		expect(form?.contains(url)).toBe(true);
		expect(
			notice.compareDocumentPosition(url) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	it("does not render a separate warning card or redundant hint", () => {
		render(<ScrapeWorkspaceForm mode="crawl" />);
		expect(
			screen.queryByText(
				/Gunakan website publik yang dapat diakses tanpa login/,
			),
		).toBeNull();
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("keeps validation and error feedback without the redundant hint", () => {
		render(<ScrapeWorkspaceForm mode="crawl" />);
		const url = screen.getByLabelText(/URL website/i);
		fireEvent.change(url, { target: { value: "notaurl" } });
		fireEvent.click(screen.getByRole("button", { name: /crawl website/i }));
		expect(screen.getByRole("alert").textContent).toMatch(/tidak valid/i);
	});
});
describe("parameter groups keep their own scope", () => {
	it("does not carry a crawl value into another mode's form", () => {
		const crawl = render(<ScrapeWorkspaceForm mode="crawl" />);
		fireEvent.click(advancedTrigger());
		fireEvent.change(screen.getByLabelText(/maksimum halaman/i), {
			target: { value: "3" },
		});
		crawl.unmount();

		render(<ScrapeWorkspaceForm mode="html" />);
		fireEvent.click(advancedTrigger());
		expect(screen.queryByLabelText(/maksimum halaman/i)).toBeNull();
		expect(
			screen.getByLabelText<HTMLInputElement>(/waktu tunggu tambahan/i).value,
		).toBe("0");
	});
});
