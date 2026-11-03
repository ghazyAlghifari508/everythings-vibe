// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	AdminPagination,
	calculatePageWindow,
} from "../components/admin-pagination";

describe("AdminPagination and calculatePageWindow", () => {
	let container: HTMLDivElement;
	let root: Root | null = null;

	beforeEach(() => {
		(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
	});

	afterEach(() => {
		if (root) {
			act(() => {
				root?.unmount();
			});
			root = null;
		}
		container?.remove();
	});

	describe("calculatePageWindow", () => {
		it("returns full linear array when totalPages <= 7", () => {
			expect(calculatePageWindow(1, 5)).toEqual([
				{ type: "page", page: 1 },
				{ type: "page", page: 2 },
				{ type: "page", page: 3 },
				{ type: "page", page: 4 },
				{ type: "page", page: 5 },
			]);
		});

		it("creates leading window with gap when on initial pages of large dataset", () => {
			const window = calculatePageWindow(2, 20);
			expect(window).toEqual([
				{ type: "page", page: 1 },
				{ type: "page", page: 2 },
				{ type: "page", page: 3 },
				{ type: "gap", after: 3 },
				{ type: "page", page: 19 },
				{ type: "page", page: 20 },
			]);
		});

		it("creates middle window with two gaps when on middle page", () => {
			const window = calculatePageWindow(10, 20);
			expect(window).toEqual([
				{ type: "page", page: 1 },
				{ type: "page", page: 2 },
				{ type: "gap", after: 2 },
				{ type: "page", page: 9 },
				{ type: "page", page: 10 },
				{ type: "page", page: 11 },
				{ type: "gap", after: 11 },
				{ type: "page", page: 19 },
				{ type: "page", page: 20 },
			]);
		});

		it("creates trailing window with gap when on final pages", () => {
			const window = calculatePageWindow(20, 20);
			expect(window).toEqual([
				{ type: "page", page: 1 },
				{ type: "page", page: 2 },
				{ type: "gap", after: 2 },
				{ type: "page", page: 19 },
				{ type: "page", page: 20 },
			]);
		});
	});

	describe("AdminPagination Component Rendering & Interactions", () => {
		it("renders empty message when totalCount is 0", () => {
			act(() => {
				root?.render(
					<AdminPagination
						page={1}
						pageSize={20}
						totalCount={0}
						totalPages={1}
						onPageChange={vi.fn()}
						entityName="pengguna"
					/>,
				);
			});

			expect(container.textContent).toContain(
				"Tidak ada pengguna yang ditampilkan.",
			);
		});

		it("renders correct range, total count, and disables previous on page 1", () => {
			const onPageChange = vi.fn();
			act(() => {
				root?.render(
					<AdminPagination
						page={1}
						pageSize={20}
						totalCount={125}
						totalPages={7}
						onPageChange={onPageChange}
						entityName="pengguna"
					/>,
				);
			});

			expect(container.textContent).toContain(
				"Menampilkan 1–20 dari 125 pengguna",
			);

			const prevButton = container.querySelector(
				'button[aria-label="Halaman sebelumnya"]',
			) as HTMLButtonElement;
			expect(prevButton.disabled).toBe(true);

			const nextButton = container.querySelector(
				'button[aria-label="Halaman berikutnya"]',
			) as HTMLButtonElement;
			expect(nextButton.disabled).toBe(false);

			act(() => {
				nextButton.click();
			});
			expect(onPageChange).toHaveBeenCalledWith(2);
		});

		it("renders middle page range and allows page clicks", () => {
			const onPageChange = vi.fn();
			act(() => {
				root?.render(
					<AdminPagination
						page={4}
						pageSize={20}
						totalCount={200}
						totalPages={10}
						onPageChange={onPageChange}
						entityName="pengguna"
					/>,
				);
			});

			expect(container.textContent).toContain(
				"Menampilkan 61–80 dari 200 pengguna",
			);

			const page5Button = container.querySelector(
				'button[aria-label="Halaman 5"]',
			) as HTMLButtonElement;
			expect(page5Button).not.toBeNull();

			act(() => {
				page5Button.click();
			});
			expect(onPageChange).toHaveBeenCalledWith(5);
		});

		it("disables next button on final page", () => {
			act(() => {
				root?.render(
					<AdminPagination
						page={10}
						pageSize={20}
						totalCount={200}
						totalPages={10}
						onPageChange={vi.fn()}
						entityName="pengguna"
					/>,
				);
			});

			const nextButton = container.querySelector(
				'button[aria-label="Halaman berikutnya"]',
			) as HTMLButtonElement;
			expect(nextButton.disabled).toBe(true);
		});

		it("allows changing page size when onPageSizeChange is provided", () => {
			const onPageSizeChange = vi.fn();
			act(() => {
				root?.render(
					<AdminPagination
						page={1}
						pageSize={20}
						totalCount={100}
						totalPages={5}
						onPageChange={vi.fn()}
						onPageSizeChange={onPageSizeChange}
						pageSizeOptions={[10, 20, 50]}
						entityName="pengguna"
					/>,
				);
			});

			const select = container.querySelector(
				'select[aria-label="Jumlah per halaman"]',
			) as HTMLSelectElement;
			expect(select).not.toBeNull();
			expect(select.value).toBe("20");

			act(() => {
				select.value = "50";
				select.dispatchEvent(new Event("change", { bubbles: true }));
			});

			expect(onPageSizeChange).toHaveBeenCalledWith(50);
		});
	});
});
