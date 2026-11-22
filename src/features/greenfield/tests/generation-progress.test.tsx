// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { GenerationProgress } from "@/features/greenfield/components/generation-progress";

let container: HTMLDivElement;
let root: Root | null = null;

afterEach(() => {
	if (root) {
		const r = root;
		act(() => {
			r.unmount();
		});
		root = null;
	}
	container?.remove();
});

function renderProgress(
	props: React.ComponentProps<typeof GenerationProgress>,
) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(<GenerationProgress {...props} />);
	});
	return container;
}

describe("GenerationProgress", () => {
	it("renders one compact status with a spinner, not steps or a waiting paragraph", () => {
		const c = renderProgress({ label: "PRD" });
		expect(c.textContent).toContain("Menyusun PRD...");
		expect(c.querySelector('[data-testid="spinner"]')).not.toBeNull();
		expect(c.querySelector("output")).not.toBeNull();
		expect(c.textContent).not.toContain("Menganalisis kebutuhan");
		expect(c.textContent).not.toContain("Sedang menganalisis");
	});

	it("uses only the document label, with no reasoning props", () => {
		const c = renderProgress({ label: "Acceptance Criteria" });
		expect(c.textContent).toBe("Menyusun Acceptance Criteria...");
	});
});
