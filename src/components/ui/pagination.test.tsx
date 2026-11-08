// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	generatePaginationPages,
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from "./pagination";

afterEach(() => {
	cleanup();
});

describe("generatePaginationPages helper", () => {
	it("returns direct sequence for 7 or fewer pages", () => {
		expect(generatePaginationPages(1, 1)).toEqual([1]);
		expect(generatePaginationPages(3, 5)).toEqual([1, 2, 3, 4, 5]);
		expect(generatePaginationPages(7, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
	});

	it("shows end ellipsis when on early pages (page <= 4)", () => {
		expect(generatePaginationPages(1, 11)).toEqual([
			1,
			2,
			3,
			4,
			5,
			"ellipsis-end",
			11,
		]);
		expect(generatePaginationPages(4, 11)).toEqual([
			1,
			2,
			3,
			4,
			5,
			"ellipsis-end",
			11,
		]);
	});

	it("shows start ellipsis when on late pages (page >= totalPages - 3)", () => {
		expect(generatePaginationPages(11, 11)).toEqual([
			1,
			"ellipsis-start",
			7,
			8,
			9,
			10,
			11,
		]);
		expect(generatePaginationPages(8, 11)).toEqual([
			1,
			"ellipsis-start",
			7,
			8,
			9,
			10,
			11,
		]);
	});

	it("shows both ellipses when on middle pages", () => {
		expect(generatePaginationPages(6, 11)).toEqual([
			1,
			"ellipsis-start",
			5,
			6,
			7,
			"ellipsis-end",
			11,
		]);
	});
});

describe("Pagination components", () => {
	it("renders accessible navigation with active states and labels", () => {
		const onPageChange = vi.fn();
		const onPrev = vi.fn();
		const onNext = vi.fn();

		render(
			<Pagination>
				<PaginationContent>
					<PaginationItem>
						<PaginationPrevious disabled onClick={onPrev} />
					</PaginationItem>
					<PaginationItem>
						<PaginationLink isActive onClick={() => onPageChange(1)}>
							1
						</PaginationLink>
					</PaginationItem>
					<PaginationItem>
						<PaginationEllipsis />
					</PaginationItem>
					<PaginationItem>
						<PaginationNext onClick={onNext} />
					</PaginationItem>
				</PaginationContent>
			</Pagination>,
		);

		const nav = screen.getByRole("navigation", { name: "pagination" });
		expect(nav).toBeDefined();

		const prevBtn = screen.getByRole("button", {
			name: "Halaman sebelumnya",
		});
		expect(prevBtn.hasAttribute("disabled")).toBe(true);

		const page1Btn = screen.getByRole("button", { name: "1" });
		expect(page1Btn.getAttribute("aria-current")).toBe("page");

		const nextBtn = screen.getByRole("button", {
			name: "Halaman berikutnya",
		});
		expect(nextBtn.hasAttribute("disabled")).toBe(false);
		fireEvent.click(nextBtn);
		expect(onNext).toHaveBeenCalledTimes(1);

		expect(screen.getByText("Halaman lainnya")).toBeDefined();
	});
});
