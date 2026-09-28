// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TemplateCatalog } from "./template-catalog";

vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
}));

afterEach(() => {
	cleanup();
});

describe("TemplateCatalog Component", () => {
	it("renders all category tabs and default templates", () => {
		render(<TemplateCatalog onUseTemplate={() => {}} onCopyPrompt={() => {}} />);
		expect(screen.getByText("Semua")).toBeDefined();
		expect(screen.getByText("Planning")).toBeDefined();
		expect(screen.getByText("Design")).toBeDefined();
		expect(screen.getByText("Boilerplate")).toBeDefined();
		expect(screen.getByPlaceholderText(/Cari template/i)).toBeDefined();
	});

	it("filters cards when category tab is clicked", () => {
		render(<TemplateCatalog onUseTemplate={() => {}} onCopyPrompt={() => {}} />);
		const designTab = screen.getByText("Design");
		fireEvent.click(designTab);

		expect(
			screen.getByText("Minimalist Dark SaaS Analytics UI"),
		).toBeDefined();
		expect(
			screen.queryByText("SaaS Analytics & Billing Dashboard"),
		).toBeNull();
	});

	it("filters cards when searching by keyword", () => {
		render(<TemplateCatalog onUseTemplate={() => {}} onCopyPrompt={() => {}} />);
		const searchInput = screen.getByPlaceholderText(/Cari template/i);
		fireEvent.change(searchInput, { target: { value: "SIMRS" } });

		expect(
			screen.getByText("SIMRS Enterprise Hospital System Boilerplate"),
		).toBeDefined();
		expect(screen.queryByText("Habit Tracker Mobile")).toBeNull();
	});
});
