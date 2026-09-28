// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TemplatesRouteView } from "./templates";

vi.mock("@tanstack/react-router", () => ({
	createFileRoute: () => (options: unknown) => options,
	useNavigate: () => vi.fn(),
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

afterEach(() => {
	cleanup();
});

describe("Templates Route View", () => {
	it("renders heading and the full template catalog", () => {
		render(<TemplatesRouteView />);
		expect(screen.getByText("Katalog Template Proyek")).toBeDefined();
		expect(screen.getByText("Semua")).toBeDefined();
		expect(
			screen.getByText("SIMRS Enterprise Hospital System Boilerplate"),
		).toBeDefined();
	});
});
