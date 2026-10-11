// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { QuestionThinking } from "./question-thinking";

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
		const r = root;
		act(() => {
			r.unmount();
		});
		root = null;
	}
	container?.remove();
	document.body.innerHTML = "";
});

describe("QuestionThinking", () => {
	it("announces activity through a live region with a labelled timer", () => {
		act(() => {
			root?.render(<QuestionThinking startedAt={Date.now()} />);
		});
		const status = container.querySelector(
			"[data-testid='codebase-question-thinking']",
		);
		expect(status?.getAttribute("aria-live")).toBe("polite");
		const timer = container.querySelector("[role='timer']");
		expect(timer?.getAttribute("aria-label")).toBe("Waktu proses");
	});

	it("measures elapsed time from the supplied real start, not from mount", () => {
		const startedAt = Date.now() - 4_000;
		act(() => {
			root?.render(<QuestionThinking startedAt={startedAt} />);
		});
		const timer = container.querySelector("[role='timer']");
		const seconds = Number.parseFloat(timer?.textContent ?? "0");
		expect(seconds).toBeGreaterThanOrEqual(3.5);
	});

	it("never renders a rotating dummy reasoning paragraph", () => {
		act(() => {
			root?.render(<QuestionThinking startedAt={Date.now()} />);
		});
		// One honest activity line only — no list, no repeated paragraphs.
		expect(container.querySelectorAll("p")).toHaveLength(0);
		expect(container.querySelectorAll("li")).toHaveLength(0);
	});

	it("keeps the spinner animation motion-safe", () => {
		act(() => {
			root?.render(<QuestionThinking startedAt={Date.now()} />);
		});
		const spinner = container.querySelector("svg");
		expect(spinner?.getAttribute("class")).toContain(
			"motion-reduce:animate-none",
		);
	});

	it("shows the caller's genuine activity line verbatim", () => {
		act(() => {
			root?.render(
				<QuestionThinking startedAt={Date.now()} activity="Memvalidasi hasil" />,
			);
		});
		expect(container.textContent).toContain("Memvalidasi hasil");
	});
});
