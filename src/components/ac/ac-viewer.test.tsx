// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { AcViewer } from "./ac-viewer";

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

function renderViewer(props: React.ComponentProps<typeof AcViewer>) {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	const r = root;
	if (!r) throw new Error("test root not initialized");
	act(() => {
		r.render(<AcViewer {...props} />);
	});
	return container;
}

describe("AcViewer flicker guard", () => {
	it("tidak render empty placeholder ketika cleanContent kosong tapi streamingContent ada dan isStreaming=false (post-done window)", () => {
		const c = renderViewer({
			content: null,
			streamingContent: "# AC\nKonten baru dari streaming",
			isStreaming: false,
			hasError: false,
			projectName: "test",
		});
		expect(c.textContent).not.toMatch(/belum digenerate/i);
		expect(c.textContent).toContain("Konten baru");
	});

	it("tetap render error state ketika hasError dan tidak ada content", () => {
		const c = renderViewer({
			content: null,
			streamingContent: "",
			isStreaming: false,
			hasError: true,
			projectName: "test",
		});
		expect(c.textContent).toMatch(/Gagal generate AC/i);
		expect(c.textContent).toMatch(/Coba Lagi/i);
	});

	it("tetap render empty Generate AC ketika benar-benar tidak ada content dari awal", () => {
		const c = renderViewer({
			content: null,
			streamingContent: "",
			isStreaming: false,
			hasError: false,
			onGenerate: () => {},
			projectName: "test",
		});
		expect(c.textContent).toMatch(/belum digenerate/i);
		expect(c.textContent).toMatch(/Generate AC/i);
	});
});
