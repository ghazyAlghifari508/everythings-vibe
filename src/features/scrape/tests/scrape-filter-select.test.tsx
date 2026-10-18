// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScrapeFilterSelect } from "../components/scrape-filter-select";

afterEach(() => {
	cleanup();
});

const options = [
	{ value: "", label: "Semua" },
	{ value: "png", label: "png" },
	{ value: "jpg", label: "jpg" },
] as const;

describe("ScrapeFilterSelect", () => {
	it("exposes the selected value through a native select", () => {
		render(
			<ScrapeFilterSelect
				label="Format"
				value=""
				onChange={() => {}}
				options={[...options]}
			/>,
		);
		const select = screen.getByLabelText("Format");
		expect(select.tagName).toBe("SELECT");
		expect((select as HTMLSelectElement).value).toBe("");
	});

	it("reports selection changes to the caller", () => {
		const onChange = vi.fn();
		render(
			<ScrapeFilterSelect
				label="Format"
				value=""
				onChange={onChange}
				options={[...options]}
			/>,
		);
		fireEvent.change(screen.getByLabelText("Format"), {
			target: { value: "png" },
		});
		expect(onChange).toHaveBeenCalledWith("png");
	});

	it("renders the same option set for every consumer", () => {
		render(
			<ScrapeFilterSelect
				label="Jenis"
				value="jpg"
				onChange={() => {}}
				options={[...options]}
			/>,
		);
		const select = screen.getByLabelText("Jenis") as HTMLSelectElement;
		expect(select.value).toBe("jpg");
		expect(select.options.length).toBe(options.length);
	});
});
