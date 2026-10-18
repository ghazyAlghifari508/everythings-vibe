// @vitest-environment jsdom
import { Cancel01Icon, Tick01Icon } from "@hugeicons/core-free-icons";
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { Icon } from "./icon";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
	if (root) {
		const currentRoot = root;
		act(() => {
			currentRoot.unmount();
		});
		root = null;
	}
	container?.remove();
	container = null;
});

function renderIcon(ui: React.ReactNode): SVGSVGElement {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	act(() => {
		root?.render(ui);
	});
	const svg = container.querySelector("svg");
	if (!svg) {
		throw new Error("SVG element not found in DOM");
	}
	return svg;
}

describe("Icon Primitive", () => {
	it("renders with default properties (18px, currentColor, strokeWidth 1.5, decorative aria-hidden)", () => {
		const svg = renderIcon(<Icon icon={Tick01Icon} />);

		expect(svg.getAttribute("width")).toBe("18");
		expect(svg.getAttribute("height")).toBe("18");
		expect(svg.getAttribute("color")).toBe("currentColor");
		expect(svg.getAttribute("stroke-width")).toBe("1.5");
		expect(svg.getAttribute("aria-hidden")).toBe("true");
	});

	it("respects explicit size, strokeWidth, and color overrides", () => {
		const svg = renderIcon(
			<Icon icon={Tick01Icon} size={24} strokeWidth={2} color="#065fd4" />,
		);

		expect(svg.getAttribute("width")).toBe("24");
		expect(svg.getAttribute("height")).toBe("24");
		expect(svg.getAttribute("stroke-width")).toBe("2");
		expect(svg.getAttribute("color")).toBe("#065fd4");
	});

	it("applies custom className and preserves SVG attributes", () => {
		const svg = renderIcon(
			<Icon
				icon={Tick01Icon}
				className="custom-icon-class text-neutral-500"
				data-testid="test-icon"
			/>,
		);

		expect(svg.getAttribute("class")).toContain("custom-icon-class");
		expect(svg.getAttribute("class")).toContain("text-neutral-500");
		expect(svg.getAttribute("data-testid")).toBe("test-icon");
	});

	it("omits decorative aria-hidden when aria-label is provided for accessible standalone usage", () => {
		const svg = renderIcon(
			<Icon icon={Tick01Icon} aria-label="Operasi berhasil" />,
		);

		expect(svg.getAttribute("aria-label")).toBe("Operasi berhasil");
		expect(svg.getAttribute("aria-hidden")).toBeNull();
	});

	it("omits decorative aria-hidden when aria-labelledby is provided", () => {
		const svg = renderIcon(
			<Icon icon={Tick01Icon} aria-labelledby="label-id" />,
		);

		expect(svg.getAttribute("aria-labelledby")).toBe("label-id");
		expect(svg.getAttribute("aria-hidden")).toBeNull();
	});

	it("respects explicit aria-hidden override", () => {
		const svg = renderIcon(<Icon icon={Tick01Icon} aria-hidden={false} />);

		expect(svg.getAttribute("aria-hidden")).toBe("false");
	});

	it("renders alternative icon when altIcon and showAlt=true are provided", () => {
		const defaultSvg = renderIcon(
			<Icon icon={Tick01Icon} altIcon={Cancel01Icon} showAlt={false} />,
		);
		const defaultPathCount = defaultSvg.querySelectorAll("path").length;

		const altSvg = renderIcon(
			<Icon icon={Tick01Icon} altIcon={Cancel01Icon} showAlt={true} />,
		);
		const altPathCount = altSvg.querySelectorAll("path").length;

		// Both icons are valid SVGs and render their respective paths
		expect(defaultPathCount).toBeGreaterThan(0);
		expect(altPathCount).toBeGreaterThan(0);
		expect(defaultSvg.innerHTML).not.toBe(altSvg.innerHTML);
	});

	it("supports forwarding ref to the root SVGSVGElement", () => {
		const ref = createRef<SVGSVGElement>();
		const svg = renderIcon(<Icon ref={ref} icon={Tick01Icon} />);

		expect(ref.current).toBe(svg);
	});

	it("renders valid SVG markup during server-side rendering (SSR)", () => {
		const html = renderToString(
			<Icon icon={Tick01Icon} className="ssr-icon" />,
		);

		expect(html).toContain("<svg");
		expect(html).toContain('width="18"');
		expect(html).toContain('height="18"');
		expect(html).toContain('aria-hidden="true"');
		expect(html).toContain("ssr-icon");
	});
});
