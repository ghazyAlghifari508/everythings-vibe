// @vitest-environment jsdom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioPageCountSelect } from "@/features/studio/components/composer/studio-page-count-select";
import { StudioSkillSelect } from "@/features/studio/components/composer/studio-skill-select";
import type { StudioDesignSkillId } from "@/lib/studio-generation-options";

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

	it("renders bundled authentic logos for skills that ship one", async () => {
		render(<StudioSkillSelect value="none" onChange={vi.fn()} />);
		openMenu(/Design skill: No Skill/i);
		await waitFor(() => {
			expect(
				screen.getByRole("menuitemradio", { name: /Impeccable/i }),
			).toBeDefined();
		});
		const impeccableLogo = document.querySelector(
			'img[src="/icons/skills/impeccable.svg"]',
		);
		const tasteLogo = document.querySelector(
			'img[src="/icons/skills/taste.png"]',
		);
		expect(impeccableLogo).not.toBeNull();
		expect(tasteLogo).not.toBeNull();
		expect(impeccableLogo?.getAttribute("alt")).toBe("Logo Impeccable");
		expect(tasteLogo?.getAttribute("alt")).toBe("Logo Taste");
		expect(impeccableLogo?.getAttribute("class")).toContain("object-contain");
	});

	it("falls back to distinct restrained icons when no official logo exists", async () => {
		render(<StudioSkillSelect value="none" onChange={vi.fn()} />);
		openMenu(/Design skill: No Skill/i);
		await waitFor(() => {
			expect(
				screen.getByRole("menuitemradio", { name: /Impeccable/i }),
			).toBeDefined();
		});
		expect(document.querySelectorAll("img")).toHaveLength(2);
		const fallbackLabels = [
			"No Skill",
			"Frontend Design",
			"UI UX Pro Max",
			"Anti-Slop",
		];
		for (const label of fallbackLabels) {
			const item = screen
				.getAllByRole("menuitemradio")
				.find((radio) => radio.textContent?.includes(label));
			expect(item, `menu item for ${label}`).toBeDefined();
			expect(item?.querySelector("img")).toBeNull();
			expect(item?.querySelector("svg")).not.toBeNull();
		}
	});

	it("renders full wrapped descriptions with accessible title and description attributes", async () => {
		render(<StudioSkillSelect value="none" onChange={vi.fn()} />);
		openMenu(/Design skill: No Skill/i);
		await waitFor(() => {
			expect(
				screen.getByRole("menuitemradio", { name: /No Skill/i }),
			).toBeDefined();
		});

		const items = screen.getAllByRole("menuitemradio");
		for (const item of items) {
			expect(item.getAttribute("title")).toBeTruthy();
			expect(item.getAttribute("aria-describedby")).toBe(
				"skill-description-tooltip",
			);
		}

		const descriptions = [
			"AI merancang tanpa panduan desain tambahan",
			"Untuk desain yang lebih rapi, detail, dan matang",
			"Untuk tampilan web dengan karakter visual yang kuat",
			"Untuk navigasi, kemudahan penggunaan, dan aksesibilitas",
			"Untuk mengurangi pola tampilan generik yang tidak diperlukan",
			"Untuk komposisi, tipografi, dan keseimbangan visual",
		];
		for (const desc of descriptions) {
			const matchingElements = screen.getAllByText(desc);
			expect(matchingElements.length).toBeGreaterThanOrEqual(1);
			const lineClampedEl = matchingElements.find((el) =>
				el.className.includes("line-clamp-2"),
			);
			expect(lineClampedEl).toBeDefined();
		}
	});

	it("renders an accessible tooltip that reveals full description and updates on pointer hover and keyboard focus", async () => {
		render(<StudioSkillSelect value="none" onChange={vi.fn()} />);
		openMenu(/Design skill: No Skill/i);
		await waitFor(() => {
			expect(screen.getByRole("tooltip")).toBeDefined();
		});

		const tooltip = screen.getByRole("tooltip");
		expect(tooltip.textContent).toContain("No Skill");
		expect(tooltip.textContent).toContain(
			"AI merancang tanpa panduan desain tambahan",
		);

		// Pointer hover updates tooltip
		const impeccableItem = screen.getByRole("menuitemradio", {
			name: /Impeccable/i,
		});
		fireEvent.pointerEnter(impeccableItem);
		expect(tooltip.textContent).toContain("Impeccable");
		expect(tooltip.textContent).toContain(
			"Untuk desain yang lebih rapi, detail, dan matang",
		);

		// Keyboard focus updates tooltip
		const tasteItem = screen.getByRole("menuitemradio", { name: /Taste/i });
		fireEvent.focus(tasteItem);
		expect(tooltip.textContent).toContain("Taste");
		expect(tooltip.textContent).toContain(
			"Untuk komposisi, tipografi, dan keseimbangan visual",
		);

		// Pointer leave resets to selected skill
		const scrollContainer = impeccableItem.closest(".overflow-y-auto");
		expect(scrollContainer).not.toBeNull();
		if (scrollContainer) {
			fireEvent.pointerLeave(scrollContainer);
			expect(tooltip.textContent).toContain("No Skill");
		}
	});

	it("disables the trigger button when disabled prop is true", () => {
		render(<StudioSkillSelect value="none" onChange={vi.fn()} disabled />);
		const button = screen.getByRole("button", {
			name: /Design skill: No Skill/i,
		});
		expect(button.getAttribute("disabled")).not.toBeNull();
		expect(button.className).toContain("disabled:cursor-not-allowed");
	});

	it("maintains a compact scrollable container within bounds", async () => {
		render(<StudioSkillSelect value="none" onChange={vi.fn()} />);
		openMenu(/Design skill: No Skill/i);
		await waitFor(() => {
			expect(
				screen.getByRole("menuitemradio", { name: /No Skill/i }),
			).toBeDefined();
		});

		const scrollContainer = document.querySelector(".max-h-64.overflow-y-auto");
		expect(scrollContainer).not.toBeNull();
		const menuContent = document.querySelector('[role="menu"]');
		expect(menuContent?.className).toContain("w-80");
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

	it("presents a titled menu with a subtitle and a single checked radio", async () => {
		render(<StudioPageCountSelect value={3} onChange={vi.fn()} />);
		openMenu(/Jumlah halaman awal: 3/i);
		await waitFor(() => {
			expect(screen.getByText("Jumlah halaman")).toBeDefined();
		});
		expect(screen.getByText("Tentukan layar awal proyek")).toBeDefined();
		const radios = screen.getAllByRole("menuitemradio");
		const checked = radios.filter(
			(item) => item.getAttribute("aria-checked") === "true",
		);
		expect(checked).toHaveLength(1);
		expect(checked[0].textContent).toContain("3 halaman");
		expect(screen.getByText("Default")).toBeDefined();
	});

	it("keeps an accessible trigger name for every value in the range", () => {
		for (const value of [1, 2, 3, 4, 5]) {
			const { unmount } = render(
				<StudioPageCountSelect value={value} onChange={vi.fn()} />,
			);
			expect(
				screen.getByRole("button", {
					name: new RegExp(`Jumlah halaman awal: ${value}`),
				}),
			).toBeDefined();
			unmount();
		}
	});
});
