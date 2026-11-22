// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { NumericBadge } from "./numeric-badge";
import { StatusBadge } from "./status-badge";
import { StatusIndicator } from "./status-indicator";

let container: HTMLDivElement;
let root: Root | null = null;

function render(element: ReactNode): HTMLElement {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(element);
	});
	return container;
}

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

describe("Badge system", () => {
	it("renders StatusIndicator as a labelled, decorative status without a container role", () => {
		const host = render(
			<StatusIndicator tone="warning" data-testid="status">
				Menunggu
			</StatusIndicator>,
		);
		const status = host.querySelector('[data-testid="status"]');
		expect(status?.textContent).toContain("Menunggu");
		expect(status?.getAttribute("data-tone")).toBe("warning");
		expect(status?.tagName.toLowerCase()).toBe("span");
		status?.querySelectorAll("svg").forEach((icon) => {
			expect(icon.getAttribute("aria-hidden")).toBe("true");
		});
	});

	it("keeps StatusBadge reserved for attention states", () => {
		const host = render(
			<StatusBadge tone="danger" data-testid="attention">
				Banned
			</StatusBadge>,
		);
		const badge = host.querySelector('[data-testid="attention"]');
		expect(badge?.textContent).toContain("Banned");
		expect(badge?.getAttribute("data-tone")).toBe("danger");
	});

	it("exposes NumericBadge counts with an accessible label", () => {
		const host = render(
			<NumericBadge count={7} label="proyek tersimpan" data-testid="count" />,
		);
		const badge = host.querySelector('[data-testid="count"]');
		expect(badge?.textContent).toContain("7");
		expect(badge?.getAttribute("aria-label")).toBe("7 proyek tersimpan");
	});
});
