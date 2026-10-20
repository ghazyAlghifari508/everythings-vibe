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
	it("validates structural integrity of canonical FAQ items", () => {
		expect(FAQ_ITEMS.length).toBeGreaterThan(0);

		const ids = FAQ_ITEMS.map((item) => item.id);
		const uniqueIds = new Set(ids);
		expect(uniqueIds.size).toBe(FAQ_ITEMS.length);

		const titles = FAQ_ITEMS.map((item) => item.title.trim().toLowerCase());
		const uniqueTitles = new Set(titles);
		expect(uniqueTitles.size).toBe(FAQ_ITEMS.length);

		const allowedIcons = new Set([
			"spark",
			"workflow",
			"document",
			"board",
			"credit",
			"feedback",
			"terminal",
		]);

		for (const item of FAQ_ITEMS) {
			expect(item.id.trim().length).toBeGreaterThan(0);
			expect(item.title.trim().length).toBeGreaterThan(0);
			expect(item.subtitle.trim().length).toBeGreaterThan(0);
			expect(item.content.trim().length).toBeGreaterThan(0);
			expect(allowedIcons.has(item.icon)).toBe(true);
		}
	});

	it("renders an accessible accordion with properly bound triggers and panels", () => {
		const rendered = renderFaq();
		const buttons = Array.from(rendered.querySelectorAll("button"));
		expect(buttons.length).toBe(FAQ_ITEMS.length);

		const firstTrigger = buttons[0];
		expect(firstTrigger).not.toBeNull();
		const panelId = firstTrigger?.getAttribute("aria-controls");
		expect(panelId).toBeTruthy();
		expect(firstTrigger?.getAttribute("aria-expanded")).toBe("false");

		const panel = panelId ? rendered.querySelector(`#${panelId}`) : null;
		expect(panel).not.toBeNull();
		expect(panel?.getAttribute("aria-labelledby")).toBe(firstTrigger?.id);
		expect(panel?.getAttribute("aria-hidden")).toBe("true");

		act(() => {
			firstTrigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(firstTrigger?.getAttribute("aria-expanded")).toBe("true");
		expect(panel?.getAttribute("aria-hidden")).toBe("false");

		act(() => {
			firstTrigger?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(firstTrigger?.getAttribute("aria-expanded")).toBe("false");
		expect(panel?.getAttribute("aria-hidden")).toBe("true");
	});

	it("renders all FAQ items into the DOM with corresponding titles", () => {
		const rendered = renderFaq();
		for (const item of FAQ_ITEMS) {
			expect(rendered.textContent).toContain(item.title);
		}
	});

	it("renders valid navigation links to feedback and bantuan hubs", () => {
		const rendered = renderFaq();
		const links = Array.from(rendered.querySelectorAll("a")).map((a) =>
			a.getAttribute("href"),
		);
		expect(links).toContain("/settings/feedback");
		expect(links).toContain("/bantuan");
	});
});
