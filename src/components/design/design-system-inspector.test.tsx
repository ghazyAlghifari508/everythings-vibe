// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DesignInspectorModel } from "@/lib/design-md-inspector";
import { DesignSystemInspector } from "./design-system-inspector";

afterEach(() => {
	cleanup();
});

const MODEL: DesignInspectorModel = {
	title: "Acme - Style Reference",
	essence: "A crisp ledger console under morning light.",
	theme: "light",
	overview: "Acme pairs a paper canvas with ink typography.",
	colors: [
		{
			name: "Canvas",
			value: "#ffffff",
			token: "--color-canvas",
			role: "Page background",
		},
		{
			name: "Cobalt",
			value: "#155eef",
			token: "--color-cobalt",
			role: "Primary CTA",
		},
	],
	typography: [
		{
			label: "Display",
			family: "Inter",
			size: "48px",
			weight: "700",
			lineHeight: "1.1",
		},
		{
			label: "Body",
			family: "Inter",
			size: "16px",
			weight: "400",
			lineHeight: "1.5",
		},
	],
	fonts: [{ family: "Inter", weights: ["700", "400"], roles: ["Display", "Body"] }],
	spacing: [
		{ label: "space-1", value: "4px" },
		{ label: "section-gap", value: "64px" },
	],
	radii: [{ label: "radius-md", value: "8px" }],
	baseUnit: "4px",
	dos: ["Do use observed colors for surfaces."],
	donts: ["Don't copy the source brand name or logo."],
};

const EMPTY_MODEL: DesignInspectorModel = {
	title: "",
	essence: "",
	theme: "unknown",
	overview: "",
	colors: [],
	typography: [],
	fonts: [],
	spacing: [],
	radii: [],
	baseUnit: "",
	dos: [],
	donts: [],
};

function renderInspector(model: DesignInspectorModel = MODEL) {
	return render(
		<DesignSystemInspector
			siteName="Acme"
			domain="acme.example"
			sourceUrl="https://acme.example/"
			model={model}
		/>,
	);
}

describe("DesignSystemInspector", () => {
	it("renders site identity from props, not from hardcoded brand data", () => {
		renderInspector();
		expect(screen.getByRole("heading", { name: "Acme" })).toBeDefined();
		expect(screen.getByText("acme.example")).toBeDefined();
		expect(
			screen.getByText("A crisp ledger console under morning light."),
		).toBeDefined();
	});

	it("renders the parsed color palette with values", () => {
		renderInspector();
		expect(
			screen.getByRole("heading", { name: /palet warna/i }),
		).toBeDefined();
		expect(screen.getByText("#155eef")).toBeDefined();
		expect(screen.getByText("Cobalt")).toBeDefined();
		expect(screen.getByText("Primary CTA")).toBeDefined();
	});

	it("renders the parsed type scale with size metadata", () => {
		renderInspector();
		expect(screen.getByRole("heading", { name: /tipografi/i })).toBeDefined();
		expect(screen.getByText("Display")).toBeDefined();
		expect(screen.getByText("48px · 700 · 1.1")).toBeDefined();
	});

	it("renders parsed font families with weights", () => {
		renderInspector();
		expect(screen.getByRole("heading", { name: /^font$/i })).toBeDefined();
		expect(screen.getByText("Inter")).toBeDefined();
		expect(screen.getByText("700, 400")).toBeDefined();
	});

	it("renders spacing and shape tokens", () => {
		renderInspector();
		expect(
			screen.getByRole("heading", { name: /spasi.*bentuk/i }),
		).toBeDefined();
		expect(screen.getByText("section-gap")).toBeDefined();
		expect(screen.getByText("64px")).toBeDefined();
		expect(screen.getByText("radius-md")).toBeDefined();
	});

	it("renders guideline rules verbatim", () => {
		renderInspector();
		expect(screen.getByRole("heading", { name: /panduan/i })).toBeDefined();
		expect(
			screen.getByText("Do use observed colors for surfaces."),
		).toBeDefined();
		expect(
			screen.getByText("Don't copy the source brand name or logo."),
		).toBeDefined();
	});

	it("omits sections without data instead of inventing values", () => {
		const { container } = renderInspector(EMPTY_MODEL);
		expect(
			screen.queryByRole("heading", { name: /palet warna/i }),
		).toBeNull();
		expect(screen.queryByRole("heading", { name: /tipografi/i })).toBeNull();
		expect(screen.queryByRole("heading", { name: /^font$/i })).toBeNull();
		expect(
			screen.queryByRole("heading", { name: /spasi.*bentuk/i }),
		).toBeNull();
		expect(screen.queryByRole("heading", { name: /panduan/i })).toBeNull();
		expect(container.querySelectorAll('[role="img"]').length).toBe(0);
	});

	it("never renders source-document tabs", () => {
		const { container } = renderInspector();
		expect(container.textContent).not.toMatch(/tailwind v4/i);
		expect(container.textContent).not.toMatch(/css variables/i);
		expect(container.textContent).not.toMatch(/design tokens/i);
		expect(container.textContent).not.toMatch(/compact|extended/i);
	});
});
