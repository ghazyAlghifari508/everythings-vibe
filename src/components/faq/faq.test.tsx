// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Faq } from "./faq";

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
	it("renders all canonical FAQ questions including codebase, studio, and CLI topics", () => {
		const rendered = renderFaq();
		expect(rendered.textContent).toContain(
			"Apa perbedaan VibePlan Greenfield dan Codebase Existing?",
		);
		expect(rendered.textContent).toContain(
			"Apa perbedaan VibeScrape dan VibeDesign Studio?",
		);
		expect(rendered.textContent).toContain(
			"Bagaimana cara menghubungkan repository lokal lewat CLI?",
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
});
