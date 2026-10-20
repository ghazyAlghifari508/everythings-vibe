// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Faq } from "./faq";
import { FAQ_ITEMS } from "./faq-data";

vi.mock("@tanstack/react-router", () => ({
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

let container: HTMLDivElement;
let root: Root | null = null;

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

beforeEach(() => {
	globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
	if (root) {
		const currentRoot = root;
		act(() => {
			currentRoot.unmount();
		});
		root = null;
	}
	container?.remove();
});

function renderFaq() {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(<Faq />);
	});
	return container;
}

describe("Faq", () => {
	it("renders canonical user-centered FAQ questions covering persistence, credits, and security", () => {
		const rendered = renderFaq();
		expect(rendered.textContent).toContain(
			"Apakah project yang saya buat tersimpan otomatis?",
		);
		expect(rendered.textContent).toContain(
			"Apakah credit tetap terpotong jika generate gagal?",
		);
		expect(rendered.textContent).toContain(
			"Apakah kode repositori saya aman saat menggunakan CLI?",
		);
	});

	it("keeps each answer linked to its trigger and toggles expanded state", () => {
		const rendered = renderFaq();
		const trigger = rendered.querySelector("button");

		expect(trigger).not.toBeNull();
		expect(trigger?.getAttribute("aria-controls")).toBeTruthy();
		expect(trigger?.getAttribute("aria-expanded")).toBe("false");

		act(() => {
			trigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(trigger?.getAttribute("aria-expanded")).toBe("true");
		const answerId = trigger?.getAttribute("aria-controls");
		const answer = answerId ? rendered.querySelector(`#${answerId}`) : null;
		expect(answer?.getAttribute("aria-labelledby")).toBe(trigger?.id);
		expect(answer?.textContent).toContain("PRD");
		expect(answer?.getAttribute("aria-hidden")).toBe("false");
	});

	it("renders links to feedback and bantuan support hub", () => {
		const rendered = renderFaq();
		const links = Array.from(rendered.querySelectorAll("a")).map((a) =>
			a.getAttribute("href"),
		);
		expect(links).toContain("/settings/feedback");
		expect(links).toContain("/bantuan");
	});

	it("has 6-10 curated items with unique IDs and no legacy taxonomy questions", () => {
		expect(FAQ_ITEMS.length).toBeGreaterThanOrEqual(6);
		expect(FAQ_ITEMS.length).toBeLessThanOrEqual(10);

		const ids = FAQ_ITEMS.map((item) => item.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(FAQ_ITEMS.length);

		for (const item of FAQ_ITEMS) {
			expect(item.title.trim().length).toBeGreaterThan(0);
			expect(item.subtitle.trim().length).toBeGreaterThan(0);
			expect(item.content.trim().length).toBeGreaterThan(0);
			expect(item.title).not.toMatch(
				/perbedaan vibescrape|perbedaan vibeplan/i,
			);
			expect(item.title).not.toMatch(/alur kerja vibeeverything/i);
		}
	});
});
