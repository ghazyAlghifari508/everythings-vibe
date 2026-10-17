// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioShortcutCarousel } from "@/features/studio/components/studio-shortcut-carousel";
import {
	canScrollNext,
	canScrollPrev,
	getCarouselStep,
} from "@/features/studio/utils/studio-shortcut-carousel-state";
import {
	STUDIO_PROMPT_SHORTCUTS,
	type StudioPromptShortcut,
} from "@/lib/studio-prompt-shortcuts";

function renderCarousel(selectedId: string | null = null) {
	const onSelect = vi.fn((_shortcut: StudioPromptShortcut) => undefined);
	render(
		<StudioShortcutCarousel
			shortcuts={STUDIO_PROMPT_SHORTCUTS}
			onSelect={onSelect}
			selectedId={selectedId}
		/>,
	);
	return { onSelect };
}

function setScrollableMetrics(viewport: HTMLElement, scrollLeft: number) {
	Object.defineProperty(viewport, "scrollWidth", {
		value: 1500,
		configurable: true,
	});
	Object.defineProperty(viewport, "clientWidth", {
		value: 320,
		configurable: true,
	});
	Object.defineProperty(viewport, "scrollLeft", {
		value: scrollLeft,
		configurable: true,
	});
}

afterEach(() => {
	cleanup();
});

describe("studio-shortcut-carousel-state", () => {
	it("menghitung satu langkah dari lebar kartu ditambah gap", () => {
		expect(getCarouselStep(260, 10, 320)).toBe(270);
	});

	it("memakai fallback proporsional viewport saat lebar kartu belum terukur", () => {
		expect(getCarouselStep(0, 10, 320)).toBe(256);
		expect(getCarouselStep(0, 10, 0)).toBe(200);
	});

	it("menentukan arah geser dari posisi scroll sebenarnya", () => {
		expect(
			canScrollPrev({ scrollLeft: 0, scrollWidth: 1500, clientWidth: 320 }),
		).toBe(false);
		expect(
			canScrollPrev({ scrollLeft: 60, scrollWidth: 1500, clientWidth: 320 }),
		).toBe(true);
		expect(
			canScrollNext({ scrollLeft: 0, scrollWidth: 1500, clientWidth: 320 }),
		).toBe(true);
		expect(
			canScrollNext({
				scrollLeft: 1180,
				scrollWidth: 1500,
				clientWidth: 320,
			}),
		).toBe(false);
	});
});

describe("StudioShortcutCarousel", () => {
	it("menampilkan heading dan seluruh brief dari kontrak canonical", () => {
		renderCarousel();
		expect(
			screen.getByRole("heading", { name: "Mulai dari brief siap pakai" }),
		).toBeDefined();
		for (const shortcut of STUDIO_PROMPT_SHORTCUTS) {
			expect(screen.getByText(shortcut.title)).toBeDefined();
		}
		expect(screen.getAllByRole("listitem")).toHaveLength(
			STUDIO_PROMPT_SHORTCUTS.length,
		);
	});

	it("meneruskan objek shortcut lengkap ke onSelect tanpa submit otomatis", () => {
		const onSelect = vi.fn((_shortcut: StudioPromptShortcut) => undefined);
		render(
			<StudioShortcutCarousel
				shortcuts={STUDIO_PROMPT_SHORTCUTS}
				onSelect={onSelect}
			/>,
		);
		const first = STUDIO_PROMPT_SHORTCUTS[0];
		fireEvent.click(
			screen.getByRole("button", { name: new RegExp(first.title) }),
		);
		expect(onSelect).toHaveBeenCalledTimes(1);
		const received = onSelect.mock.calls[0]?.[0];
		expect(received).toEqual(first);
		expect(received?.id).toBe(first.id);
		expect(received?.prompt.length).toBeGreaterThanOrEqual(200);
		expect(received?.designMode).toBe(first.designMode);
		expect(received?.initialPageCount).toBe(first.initialPageCount);
	});

	it("menandai brief terpilih lewat selectedId", () => {
		const selected = STUDIO_PROMPT_SHORTCUTS[1];
		render(
			<StudioShortcutCarousel
				shortcuts={STUDIO_PROMPT_SHORTCUTS}
				onSelect={vi.fn((_shortcut: StudioPromptShortcut) => undefined)}
				selectedId={selected.id}
			/>,
		);
		const card = screen.getByRole("button", {
			name: new RegExp(selected.title),
		});
		expect(card.getAttribute("aria-pressed")).toBe("true");
	});

	it("menonaktifkan panah di tepi dan menggeser satu langkah logis saat panah diklik", () => {
		const seenSteps: ScrollToOptions[] = [];
		const originalScrollBy = Element.prototype.scrollBy;
		Element.prototype.scrollBy = (
			xOrOptions?: number | ScrollToOptions,
		): void => {
			if (typeof xOrOptions === "object" && xOrOptions)
				seenSteps.push(xOrOptions);
		};
		try {
			renderCarousel();
			const prev = screen.getByRole("button", { name: "Brief sebelumnya" });
			const next = screen.getByRole("button", { name: "Brief berikutnya" });
			expect(prev).toHaveProperty("disabled", true);
			expect(next).toHaveProperty("disabled", true);

			const viewport = screen.getByRole("region", {
				name: "Daftar brief siap pakai",
			});
			setScrollableMetrics(viewport, 0);
			fireEvent.scroll(viewport);
			expect(prev).toHaveProperty("disabled", true);
			expect(next).toHaveProperty("disabled", false);

			fireEvent.click(next);
			expect(seenSteps).toHaveLength(1);
			expect(seenSteps[0]?.behavior).toBe("smooth");
			expect(seenSteps[0]?.left).toBe(256);

			setScrollableMetrics(viewport, 600);
			fireEvent.scroll(viewport);
			expect(prev).toHaveProperty("disabled", false);
			expect(next).toHaveProperty("disabled", false);

			fireEvent.click(prev);
			expect(seenSteps).toHaveLength(2);
			expect(seenSteps[1]?.behavior).toBe("smooth");
			expect(seenSteps[1]?.left).toBe(-256);
		} finally {
			Element.prototype.scrollBy = originalScrollBy;
		}
	});

	it("tidak membajak tombol panah di dalam kartu dan panah tetap menggeser", () => {
		const seenSteps: ScrollToOptions[] = [];
		const originalScrollBy = Element.prototype.scrollBy;
		Element.prototype.scrollBy = (
			xOrOptions?: number | ScrollToOptions,
		): void => {
			if (typeof xOrOptions === "object" && xOrOptions)
				seenSteps.push(xOrOptions);
		};
		try {
			renderCarousel();
			const viewport = screen.getByRole("region", {
				name: "Daftar brief siap pakai",
			});

			const first = STUDIO_PROMPT_SHORTCUTS[0];
			const card = screen.getByRole("button", {
				name: new RegExp(first.title),
			});
			fireEvent.keyDown(card, { key: "ArrowRight" });
			expect(seenSteps).toHaveLength(0);

			setScrollableMetrics(viewport, 0);
			fireEvent.scroll(viewport);
			fireEvent.click(screen.getByRole("button", { name: "Brief berikutnya" }));
			expect(seenSteps).toHaveLength(1);
			expect(seenSteps[0]?.behavior).toBe("smooth");
		} finally {
			Element.prototype.scrollBy = originalScrollBy;
		}
	});

	it("membiarkan panah dan kartu tetap fokusabel via keyboard", () => {
		renderCarousel();
		expect(
			screen
				.getByRole("button", { name: "Brief sebelumnya" })
				.getAttribute("tabindex"),
		).toBeNull();
		expect(
			screen
				.getByRole("button", { name: "Brief berikutnya" })
				.getAttribute("tabindex"),
		).toBeNull();
		for (const shortcut of STUDIO_PROMPT_SHORTCUTS) {
			const card = screen.getByRole("button", {
				name: new RegExp(shortcut.title),
			});
			expect(card.getAttribute("tabindex")).toBeNull();
		}
	});
});
