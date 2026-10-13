// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioDesignSkillId } from "@/lib/studio-generation-options";
import { StudioPageCountSelect } from "./studio-page-count-select";
import { StudioSkillSelect } from "./studio-skill-select";

function installRadixDomPolyfills() {
	class ResizeObserverStub {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	vi.stubGlobal("ResizeObserver", ResizeObserverStub);
	if (!Element.prototype.hasPointerCapture) {
		Element.prototype.hasPointerCapture = () => false;
		Element.prototype.setPointerCapture = () => {};
		Element.prototype.releasePointerCapture = () => {};
	}
	if (!Element.prototype.scrollIntoView) {
		Element.prototype.scrollIntoView = () => {};
	}
}

function openMenu(name: string | RegExp) {
	fireEvent.pointerDown(screen.getByRole("button", { name }), {
		button: 0,
		ctrlKey: false,
		pointerType: "mouse",
	});
}

describe("StudioSkillSelect", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installRadixDomPolyfills();
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("shows No Skill as the default active option", () => {
		render(<StudioSkillSelect value="none" onChange={vi.fn()} />);
		expect(
			screen.getByRole("button", { name: /Design skill: No Skill/i }),
		).toBeDefined();
	});

	it("lists every required skill as a single-selection radio item", async () => {
		render(<StudioSkillSelect value="none" onChange={vi.fn()} />);
		openMenu(/Design skill: No Skill/i);
		await waitFor(() => {
			expect(
				screen.getByRole("menuitemradio", { name: /No Skill/i }),
			).toBeDefined();
		});
		const radios = screen.getAllByRole("menuitemradio");
		expect(radios).toHaveLength(6);
		expect(
			screen.getByRole("menuitemradio", { name: /Impeccable/i }),
		).toBeDefined();
		expect(
			screen.getByRole("menuitemradio", { name: /Frontend Design/i }),
		).toBeDefined();
		expect(
			screen.getByRole("menuitemradio", { name: /UI UX Pro Max/i }),
		).toBeDefined();
		expect(
			screen.getByRole("menuitemradio", { name: /Anti-Slop/i }),
		).toBeDefined();
		expect(screen.getByRole("menuitemradio", { name: /Taste/i })).toBeDefined();
	});

	it("marks exactly one skill as checked and reports its stable id", async () => {
		const onChange = vi.fn();
		render(<StudioSkillSelect value="taste" onChange={onChange} />);
		openMenu(/Design skill: Taste/i);
		await waitFor(() => {
			expect(
				screen.getByRole("menuitemradio", { name: /Taste/i }),
			).toBeDefined();
		});
		const checked = screen
			.getAllByRole("menuitemradio")
			.filter((item) => item.getAttribute("aria-checked") === "true");
		expect(checked).toHaveLength(1);
		fireEvent.click(
			screen.getByRole("menuitemradio", { name: /Frontend Design/i }),
		);
		expect(onChange).toHaveBeenCalledWith("frontend-design");
		const ids: StudioDesignSkillId[] = [
			"none",
			"impeccable",
			"frontend-design",
			"ui-ux-pro-max",
			"anti-slop",
			"taste",
		];
		expect(ids).toContain(onChange.mock.calls[0][0]);
	});
});

describe("StudioPageCountSelect", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		installRadixDomPolyfills();
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("offers exactly the 1-5 page range with the default marked", async () => {
		const onChange = vi.fn();
		render(<StudioPageCountSelect value={3} onChange={onChange} />);
		expect(
			screen.getByRole("button", { name: /Jumlah halaman awal: 3/i }),
		).toBeDefined();
		openMenu(/Jumlah halaman awal: 3/i);
		await waitFor(() => {
			expect(
				screen.getByRole("menuitemradio", { name: /1 halaman/i }),
			).toBeDefined();
		});
		expect(screen.getAllByRole("menuitemradio")).toHaveLength(5);
		fireEvent.click(screen.getByRole("menuitemradio", { name: /5 halaman/i }));
		expect(onChange).toHaveBeenCalledWith(5);
	});
});
